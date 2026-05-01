"""Bitfinex Funding adapter — production async,從 PoC #2 升級。

支援:
- self-custody mode:從 DB 讀加密 API key/secret(per-friend)
- platform mode:用 settings.BITFINEX_API_KEY / SECRET(env)
- 純讀:wallets / funding offers / funding credits / FRR
- async httpx
- HMAC-SHA384 簽章 + nonce monotonic

Phase 1 只實作 read 路徑;write (submit / cancel offer)留給 F-Phase 3。
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
SYMBOL_AUTH = "fUSDT"  # auth endpoints
SYMBOL_PUBLIC = "fUST"  # public ticker (UST=USDT)


# ─────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────


@dataclass(frozen=True)
class BitfinexPosition:
    funding_balance: Decimal  # idle in funding wallet
    lent_total: Decimal  # active credits (借出去)
    daily_earned_estimate: Decimal | None  # 估算當日結算(若可拿到)


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
        """讀 funding wallet idle + active credits 加總。"""
        async with httpx.AsyncClient() as client:
            wallets = await self._auth_post(client, "v2/auth/r/wallets")
            credits = await self._auth_post(
                client, f"v2/auth/r/funding/credits/{SYMBOL_AUTH}"
            )
        # wallets: [WALLET_TYPE, CURRENCY, BALANCE, UNSETTLED_INTEREST, AVAILABLE, ...]
        funding_balance = Decimal(0)
        for w in wallets or []:
            if len(w) < 3:
                continue
            if w[0] == "funding" and w[1] == "UST":
                funding_balance = Decimal(str(w[2] or 0))
                break
        # credits: [ID, SYMBOL, SIDE, MTS_CREATE, MTS_UPDATE, AMOUNT, ...]
        lent_total = Decimal(0)
        for c in credits or []:
            if len(c) < 6:
                continue
            lent_total += Decimal(str(c[5] or 0))
        return BitfinexPosition(
            funding_balance=funding_balance,
            lent_total=lent_total,
            daily_earned_estimate=None,
        )


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
