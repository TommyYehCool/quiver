"""Bitfinex Funding adapter — production async,從 PoC #2 升級。

支援:
- self-custody mode:從 DB 讀加密 API key/secret(per-friend)
- platform mode:用 settings.BITFINEX_API_KEY / SECRET(env)
- 讀路徑:wallets / funding offers / funding credits / FRR
- 寫路徑(F-Phase 3 / Path A MVP):funding deposit address / submit offer /
  cancel offer / list active offers
- async httpx
- HMAC-SHA384 簽章 + nonce monotonic

Auto-renew 暫不用 Bitfinex 原生 `/v2/auth/w/funding/auto`;由我們的
reconciliation worker 看到 funding wallet 又 idle ≥ min 後重新 submit。
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.models.earn import EarnBitfinexConnection
from app.services import crypto
from app.services.earn import encryption as earn_crypto
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)

API_BASE = "https://api.bitfinex.com"
# Bitfinex uses `UST` as the wallet/asset code for Tether on most modern endpoints.
# Funding-pair symbol = `fUST`. Credit-list endpoint *also* accepts `fUSDT` as a
# legacy alias, but `funding/offer/submit` only accepts `fUST` (returns 500
# "symbol: invalid" otherwise — verified 2026-05-03 in F-3b e2e test).
# Standardize on `fUST` for all auth endpoints to avoid the trap.
SYMBOL_AUTH = "fUST"
SYMBOL_PUBLIC = "fUST"  # public ticker


# ─────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────


@dataclass(frozen=True)
class BitfinexPosition:
    funding_balance: Decimal       # 總額(包含 lent + idle)
    funding_available: Decimal     # 真正可用的(扣掉 active loans / locked)
    lent_total: Decimal            # active credits (借出去)
    daily_earned_estimate: Decimal | None
    active_credits: tuple["FundingCredit", ...] = ()  # 每筆 lender-side loan 的詳細


@dataclass(frozen=True)
class FundingCredit:
    """Active funding credit/loan — money currently lent out (lender side).

    Sourced from `/v2/auth/r/funding/credits/<sym>` or `/v2/auth/r/funding/loans/<sym>`
    (Bitfinex 的 classification 不一致,我們兩個都查再合)。Only entries with
    SIDE=1 (lender) are exposed via this dataclass.
    """

    id: int
    symbol: str
    amount: Decimal              # principal currently lent
    rate_daily: Decimal          # daily rate (0.0001 = 0.01% / day)
    period_days: int             # original period
    opened_at_ms: int            # unix ms when loan started
    side: int                    # 1 = lender (we lent), -1 = borrower

    @property
    def expires_at_ms(self) -> int:
        return self.opened_at_ms + self.period_days * 86_400_000

    @property
    def expected_interest_at_expiry(self) -> Decimal:
        """Total interest if loan runs full term:amount × rate × days."""
        return self.amount * self.rate_daily * Decimal(self.period_days)

    @property
    def apr_pct(self) -> Decimal:
        """Annualized rate as percentage (informational)."""
        return self.rate_daily * Decimal(365) * Decimal(100)


@dataclass(frozen=True)
class FundingOffer:
    """Active funding offer, parsed from `/v2/auth/r/funding/offers/<sym>` rows."""

    id: int
    symbol: str            # e.g. "fUSDT"
    amount: Decimal        # remaining unmatched amount
    rate: Decimal          # daily rate (0 if FRR market order)
    period: int            # days
    flags: int


@dataclass(frozen=True)
class FundingDepositAddress:
    """Deposit address for funding wallet on a specific network method."""

    address: str
    method: str            # e.g. "tetherusx" (USDT-TRX)
    pool_address: str | None = None  # for chains that need memo (TRC20 doesn't)


@dataclass(frozen=True)
class BitfinexMarket:
    """公開市場資料(用 fUST symbol),所有 friend 共用。"""

    frr_daily: Decimal  # 0.00025 = 0.025% / day
    bid_daily: Decimal
    ask_daily: Decimal
    last_daily: Decimal
    funding_amount_available: Decimal | None

    @property
    def frr_apy_pct(self) -> Decimal:
        return self.frr_daily * Decimal(365) * Decimal(100)

    @property
    def last_apy_pct(self) -> Decimal:
        return self.last_daily * Decimal(365) * Decimal(100)


# ─────────────────────────────────────────────────────────
# Nonce helper(monotonic ms,確保即使 process restart 仍嚴格遞增)
# ─────────────────────────────────────────────────────────

_nonce_lock = asyncio.Lock()
_last_nonce: int = 0


async def _next_nonce() -> str:
    global _last_nonce
    async with _nonce_lock:
        now = int(time.time() * 1000)
        if now <= _last_nonce:
            now = _last_nonce + 1
        _last_nonce = now
        return str(now)


# ─────────────────────────────────────────────────────────
# Adapter
# ─────────────────────────────────────────────────────────


class BitfinexFundingAdapter:
    """單一 connection 的 adapter。每個 earn_account 對應一個 instance。"""

    def __init__(self, api_key: str, api_secret: str):
        self._key = api_key
        self._secret = api_secret

    @classmethod
    async def from_connection(
        cls, db: AsyncSession, conn: EarnBitfinexConnection
    ) -> "BitfinexFundingAdapter":
        """從 DB 連線解密出來(self-custody mode);platform mode 走 .from_platform()。"""
        if conn.is_platform_key:
            return cls.from_platform()
        if not conn.encrypted_api_key or not conn.encrypted_api_secret:
            raise ValueError("connection has no encrypted key")
        api_key = await earn_crypto.decrypt_bitfinex_key(
            db,
            ciphertext_b64=conn.encrypted_api_key,
            key_version=conn.key_version or 1,
        )
        api_secret = await earn_crypto.decrypt_bitfinex_key(
            db,
            ciphertext_b64=conn.encrypted_api_secret,
            key_version=conn.key_version or 1,
        )
        return cls(api_key=api_key, api_secret=api_secret)

    @classmethod
    def from_platform(cls) -> "BitfinexFundingAdapter":
        """走 env 的 platform Bitfinex key(目前用於 admin 自己的帳戶,future V0.5 commercial)。"""
        env_key = settings.bitfinex_api_key.get_secret_value()
        env_secret = settings.bitfinex_api_secret.get_secret_value()
        if not env_key or not env_secret:
            raise ValueError("BITFINEX_API_KEY / BITFINEX_API_SECRET 未設")
        return cls(api_key=env_key, api_secret=env_secret)

    # ──── auth ────

    async def _auth_post(
        self, client: httpx.AsyncClient, path: str, body: dict | None = None
    ) -> Any:
        nonce = await _next_nonce()
        body_json = json.dumps(body or {})
        msg = f"/api/{path}{nonce}{body_json}"
        sig = hmac.new(
            self._secret.encode("utf-8"),
            msg.encode("utf-8"),
            hashlib.sha384,
        ).hexdigest()
        r = await client.post(
            f"{API_BASE}/{path}",
            headers={
                "Content-Type": "application/json",
                "bfx-nonce": nonce,
                "bfx-apikey": self._key,
                "bfx-signature": sig,
            },
            content=body_json,
            timeout=15.0,
        )
        r.raise_for_status()
        return r.json()

    # ──── read methods ────

    async def get_funding_position(self) -> BitfinexPosition:
        """讀 funding wallet 餘額 + 已借出總額。

        Bitfinex 的 funding 部位實際會出現在 `/funding/credits/` 或 `/funding/loans/`,
        看 Bitfinex 內部分類(我們無法控制)。為了求穩,兩個都查,把 SIDE=1 (lender side)
        的 amount 全部加總當作 lent_total。
        Row format(兩個 endpoint 同):[ID, SYMBOL, SIDE, MTS_CREATE, MTS_UPDATE, AMOUNT, ...]
        """
        async with httpx.AsyncClient() as client:
            wallets = await self._auth_post(client, "v2/auth/r/wallets")
            credits = await self._auth_post(
                client, f"v2/auth/r/funding/credits/{SYMBOL_AUTH}"
            )
            loans = await self._auth_post(
                client, f"v2/auth/r/funding/loans/{SYMBOL_AUTH}"
            )

        funding_balance = Decimal(0)
        funding_available = Decimal(0)
        for w in wallets or []:
            if len(w) < 5:
                continue
            if w[0] == "funding" and w[1] == "UST":
                funding_balance = Decimal(str(w[2] or 0))
                funding_available = Decimal(str(w[4] or 0))
                break

        lent_total = Decimal(0)
        active_credits: list[FundingCredit] = []
        # Row format(credits + loans 同):
        #   [ID, SYMBOL, SIDE, MTS_CREATE, MTS_UPDATE, AMOUNT, FLAGS, STATUS,
        #    RATE_TYPE, _, _, RATE, PERIOD, MTS_OPENING, MTS_LAST_PAYOUT, ...]
        for row in (credits or []) + (loans or []):
            if not isinstance(row, list) or len(row) < 14:
                continue
            side = row[2] if len(row) > 2 else None
            if side != 1:
                continue  # only lender-side (SIDE=1) counts as our lent funds
            try:
                amount = Decimal(str(row[5] or 0))
                rate = Decimal(str(row[11] or 0))
                period = int(row[12] or 0)
                opened = int(row[13] or row[3] or 0)
                cred = FundingCredit(
                    id=int(row[0]),
                    symbol=str(row[1]),
                    amount=amount,
                    rate_daily=rate,
                    period_days=period,
                    opened_at_ms=opened,
                    side=int(side),
                )
            except (TypeError, ValueError):
                continue
            lent_total += cred.amount
            active_credits.append(cred)

        # Daily earned estimate = sum(amount × daily_rate) across active credits
        daily_earned: Decimal | None = None
        if active_credits:
            daily_earned = sum(
                (c.amount * c.rate_daily for c in active_credits),
                Decimal(0),
            )

        return BitfinexPosition(
            funding_balance=funding_balance,
            funding_available=funding_available,
            lent_total=lent_total,
            daily_earned_estimate=daily_earned,
            active_credits=tuple(active_credits),
        )

    # ──── write methods (F-Phase 3 / Path A MVP) ────

    async def get_funding_deposit_address(
        self, method: str = "tetherusx", op_renew: int = 0
    ) -> FundingDepositAddress:
        """Auto-fetch user 的 funding wallet TRC20 USDT 入金地址。

        `method='tetherusx'` = USDT on Tron。`op_renew=0` 拿現有地址,1 = 強制 generate
        新地址(我們用 0;Bitfinex 入金地址預設永久,除非 user 自己 rotate)。

        permission 需要 "Wallets → Get deposit addresses"。

        Bitfinex response:
            [MTS, TYPE, MSG_ID, null, [_, CURR, METHOD, REMARK, _, _, _, _, _, _, _, _,
                                       AMOUNT, FEES, _, _, ADDRESS, POOL_ADDRESS, ...],
             CODE, STATUS, TEXT]
        """
        body = {"wallet": "funding", "method": method, "op_renew": op_renew}
        async with httpx.AsyncClient() as client:
            resp = await self._auth_post(client, "v2/auth/w/deposit/address", body)
        if not isinstance(resp, list) or len(resp) < 7:
            raise ValueError(f"unexpected deposit_address response shape: {resp!r}")
        if resp[6] != "SUCCESS":
            raise ValueError(f"deposit_address failed: status={resp[6]} text={resp[5] if len(resp) > 5 else None}")
        inner = resp[4]
        if not isinstance(inner, list) or len(inner) < 17:
            raise ValueError(f"unexpected deposit_address inner shape: {inner!r}")
        address = inner[16]
        if not isinstance(address, str) or not address:
            raise ValueError(f"deposit_address missing address field: {inner!r}")
        pool = inner[17] if len(inner) > 17 and isinstance(inner[17], str) else None
        return FundingDepositAddress(address=address, method=method, pool_address=pool)

    async def submit_funding_offer(
        self,
        amount: Decimal,
        period_days: int,
        rate: Decimal | None = None,
        symbol: str = SYMBOL_AUTH,
    ) -> int:
        """Submit a funding offer。回傳 offer_id (int)。

        rate=None → LIMIT 訂單 at rate=0,即「以當前 FRR 成交」(Bitfinex 文件稱
        為 market funding offer)。rate=Decimal(...) → LIMIT at 指定 daily rate。

        period_days: 2-30(Bitfinex 規則)。

        permission 需要 "Margin Funding → Offer, cancel and close funding"。

        Bitfinex response: [MTS, TYPE, MSG_ID, null, OFFER_DATA, CODE, STATUS, TEXT]
        OFFER_DATA[0] = offer id
        """
        if period_days < 2 or period_days > 30:
            raise ValueError(f"period_days must be 2-30, got {period_days}")
        if amount <= 0:
            raise ValueError(f"amount must be positive, got {amount}")
        body = {
            "type": "LIMIT",
            "symbol": symbol,
            "amount": str(amount),
            "rate": str(rate) if rate is not None else "0",
            "period": int(period_days),
            "flags": 0,
        }
        async with httpx.AsyncClient() as client:
            resp = await self._auth_post(client, "v2/auth/w/funding/offer/submit", body)
        if not isinstance(resp, list) or len(resp) < 7:
            raise ValueError(f"unexpected offer/submit response shape: {resp!r}")
        if resp[6] != "SUCCESS":
            raise ValueError(f"offer/submit failed: status={resp[6]} text={resp[7] if len(resp) > 7 else None}")
        offer_data = resp[4]
        if not isinstance(offer_data, list) or len(offer_data) < 1:
            raise ValueError(f"offer/submit missing OFFER_DATA: {resp!r}")
        offer_id = offer_data[0]
        if not isinstance(offer_id, int):
            raise ValueError(f"offer/submit returned non-int offer_id: {offer_id!r}")
        return offer_id

    async def cancel_funding_offer(self, offer_id: int) -> None:
        """Cancel an active funding offer by id。Idempotent for already-cancelled."""
        async with httpx.AsyncClient() as client:
            resp = await self._auth_post(
                client, "v2/auth/w/funding/offer/cancel", {"id": int(offer_id)}
            )
        if not isinstance(resp, list) or len(resp) < 7:
            raise ValueError(f"unexpected offer/cancel response shape: {resp!r}")
        if resp[6] != "SUCCESS":
            # ERROR may mean already-cancelled / already-matched — surface but
            # caller can decide how to react.
            raise ValueError(f"offer/cancel failed: status={resp[6]} text={resp[7] if len(resp) > 7 else None}")

    async def list_active_offers(self, symbol: str = SYMBOL_AUTH) -> list[FundingOffer]:
        """List active(unmatched / partially-matched)funding offers for a symbol.

        Endpoint回 array of arrays;each row:
            [ID, SYMBOL, MTS_CREATE, MTS_UPDATE, AMOUNT, AMOUNT_ORIG, TYPE,
             _, _, FLAGS, STATUS, _, _, _, RATE, PERIOD, NOTIFY, HIDDEN,
             _, RENEW, RATE_REAL]
        """
        async with httpx.AsyncClient() as client:
            resp = await self._auth_post(client, f"v2/auth/r/funding/offers/{symbol}")
        if not isinstance(resp, list):
            return []
        out: list[FundingOffer] = []
        for row in resp:
            if not isinstance(row, list) or len(row) < 16:
                continue
            try:
                out.append(
                    FundingOffer(
                        id=int(row[0]),
                        symbol=str(row[1]),
                        amount=Decimal(str(row[4] or 0)),
                        rate=Decimal(str(row[14] or 0)),
                        period=int(row[15] or 0),
                        flags=int(row[9] or 0),
                    )
                )
            except (ValueError, TypeError):
                continue
        return out


# ─────────────────────────────────────────────────────────
# Public market data(no auth)
# ─────────────────────────────────────────────────────────


async def fetch_market_frr() -> BitfinexMarket | None:
    """讀公開 fUST ticker,所有 friend 共用一份。"""
    url = f"{API_BASE}/v2/ticker/{SYMBOL_PUBLIC}"
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(url, timeout=10.0)
            r.raise_for_status()
            t = r.json()
    except Exception as e:
        logger.warning("bitfinex_frr_fetch_failed", error=str(e))
        return None
    if not t or len(t) < 16:
        return None
    return BitfinexMarket(
        frr_daily=Decimal(str(t[0])),
        bid_daily=Decimal(str(t[1])),
        ask_daily=Decimal(str(t[4])),
        last_daily=Decimal(str(t[9])),
        funding_amount_available=(
            Decimal(str(t[15])) if t[15] is not None else None
        ),
    )


@dataclass(frozen=True)
class BookOffer:
    """One row from the public funding order book.

    Bitfinex's funding book returns offers (lenders willing to lend at a
    given rate for a given period) and bids (borrowers). For F-5a-3 spike
    capture we care about the OFFER side — what rate is the marginal
    lender posting? If our offer matches or beats it, we get filled.
    """

    rate_daily: Decimal       # 0.0001 = 0.01% / day
    period_days: int
    amount: Decimal           # positive for offers, negative for bids
    count: int                # number of distinct offers at this rate

    @property
    def apr_pct(self) -> Decimal:
        return self.rate_daily * Decimal(365) * Decimal(100)


async def fetch_funding_book(
    symbol: str = SYMBOL_PUBLIC, precision: str = "P0", length: int = 100
) -> list[BookOffer]:
    """Fetch live funding order book — public, no auth.

    Returns positive-amount entries (offers from lenders). Bids are negative
    and stripped (we don't lend against bids, we post our own offers).

    Bitfinex book format (P0 raw, length 25/100): list of [rate, period,
    count, amount]. Offer rate is positive, period in days, amount positive
    for sell side. Negative amount = borrower bid; we filter those out.

    Rate-limit: 90 req/min per IP across all public endpoints. F-5a-3.1
    cron at 5min × 1 call per cycle is well under.
    """
    url = f"{API_BASE}/v2/book/{symbol}/{precision}"
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(url, params={"len": length}, timeout=10.0)
            r.raise_for_status()
            rows = r.json()
    except Exception as e:
        logger.warning(
            "bitfinex_book_fetch_failed", symbol=symbol, error=str(e)
        )
        return []

    offers: list[BookOffer] = []
    for row in rows:
        if not row or len(row) < 4:
            continue
        # P0 format: [rate, period, count, amount]
        amount = Decimal(str(row[3]))
        if amount <= 0:
            continue  # bids — skip
        offers.append(
            BookOffer(
                rate_daily=Decimal(str(row[0])),
                period_days=int(row[1]),
                count=int(row[2]),
                amount=amount,
            )
        )
    # Sort ascending by rate so caller can iterate from cheapest to most aggressive
    offers.sort(key=lambda o: o.rate_daily)
    return offers
