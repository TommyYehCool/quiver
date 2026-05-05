"""Path A auto-lend pipeline (F-Phase 3 / EARN-PATH-A-MVP-PLAN.md).

User deposits USDT → sweep to HOT → this module:
  1. Broadcasts USDT from HOT to user's own Bitfinex Funding TRC20 address
  2. Polls Bitfinex API to confirm credit
  3. Submits a funding offer (FRR, 2 days)

State machine lives in earn_positions table; see EarnPositionStatus enum.

Two arq worker entry points:
  - auto_lend_dispatcher(user_id) — triggered after sweep_user; broadcasts
  - auto_lend_finalizer(position_id) — triggered ~5min later; confirms credit + submits offer

Plus helpers:
  - refresh_deposit_address(earn_account_id) — fetch + cache the user's Bitfinex
    funding deposit address (called from /earn/connect onboarding flow and as
    a defensive refresh before broadcast)
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.earn import (
    EarnAccount,
    EarnPosition,
    EarnPositionStatus,
    EarnStrategyPreset,
)
from app.services import tatum
from app.services.earn import repo as earn_repo
from app.services.earn.bitfinex_adapter import (
    API_BASE,
    SYMBOL_SPOT_USDT_USD,
    BitfinexFundingAdapter,
    FundingDepositAddress,
    fetch_funding_book,
    fetch_market_frr,
)
import httpx
from app.services.ledger import get_user_balance, post_earn_outbound
from app.services.tatum import TatumError, TatumNotConfigured
from app.services.wallet import (
    _derive_fee_payer_private_key_hex,
    _derive_hot_wallet_private_key_hex,
    _derive_platform_fee_payer_address,
    _derive_platform_hot_wallet_address,
    _load_master_seed,
)

logger = get_logger(__name__)

# Bitfinex funding offer minimum (platform rule)
MIN_AUTO_LEND_USDT = Decimal("150")

# HOT 對 user.bitfinex_funding broadcast 前要有的 TRX(沿用 sweep 模式)
HOT_TRX_MIN_FOR_BROADCAST = Decimal("30")

# Default funding offer params (used when dynamic period decision can't be
# made — e.g., rate is None / FRR mode).
DEFAULT_OFFER_PERIOD_DAYS = 2

# F-5a-3.4: dynamic period selection. Anchors the offer's lock-up duration
# to the rate environment. Higher rates → longer lock-up to capture the
# elevated yield before the market normalizes. Lower rates → short lock-up
# so we can re-price quickly when rates recover.
#
# Bitfinex funding period constraints: min 2 days, max 120 days. Rates
# expressed as APR (annualized) for readability — each tick represents
# the boundary between two period choices.
#
# F-5a-3.5: per-preset thresholds. CONSERVATIVE prefers shorter lock-ups
# (max 7 days) for liquidity; AGGRESSIVE locks high-rate tranches up to 60d
# to maximise spike yield capture. BALANCED is the F-5a-3.4 default.
PERIOD_RATE_THRESHOLDS_APR_BALANCED = [
    (Decimal("15"), 30),  # >= 15% APR → lock 30 days
    (Decimal("10"), 14),  # 10-15% APR → 14 days
    (Decimal("5"), 7),    # 5-10% APR  → 7 days
    (Decimal("0"), 2),    # < 5% APR   → 2 days (default short)
]
PERIOD_RATE_THRESHOLDS_APR_CONSERVATIVE = [
    (Decimal("10"), 7),   # >= 10% APR → 7 days (cap, never lock long)
    (Decimal("5"), 4),    # 5-10% APR  → 4 days
    (Decimal("0"), 2),    # < 5% APR   → 2 days
]
PERIOD_RATE_THRESHOLDS_APR_AGGRESSIVE = [
    (Decimal("20"), 60),  # >= 20% APR → lock 60 days (extreme spike — milk it)
    (Decimal("12"), 30),  # 12-20% APR → 30 days
    (Decimal("7"), 14),   # 7-12% APR  → 14 days
    (Decimal("3"), 7),    # 3-7% APR   → 7 days
    (Decimal("0"), 2),    # < 3% APR   → 2 days
]

# Backward compat alias — older callers + tests that don't pass a preset get
# the same behaviour they always had (Balanced was the only preset before).
PERIOD_RATE_THRESHOLDS_APR = PERIOD_RATE_THRESHOLDS_APR_BALANCED


def _period_thresholds_for(preset: str) -> list[tuple[Decimal, int]]:
    """Return the period-selection threshold table for a preset value."""
    if preset == EarnStrategyPreset.CONSERVATIVE.value:
        return PERIOD_RATE_THRESHOLDS_APR_CONSERVATIVE
    if preset == EarnStrategyPreset.AGGRESSIVE.value:
        return PERIOD_RATE_THRESHOLDS_APR_AGGRESSIVE
    return PERIOD_RATE_THRESHOLDS_APR_BALANCED


def _select_period_days(
    rate_daily: Decimal | None,
    preset: str = EarnStrategyPreset.BALANCED.value,
) -> int:
    """Pick funding offer period (days) based on the rate environment.

    Strategy:
      - High rates are usually transient (spike events). Lock them in long
        before the market reverts to baseline.
      - Low rates are bad — keep period short so we can re-price up when
        rates recover.

    The per-preset table is chosen by `preset` (F-5a-3.5). Default keeps
    backward-compatible BALANCED behaviour for callers that don't pass one.

    Returns DEFAULT_OFFER_PERIOD_DAYS (2) if rate is None (FRR mode).
    """
    if rate_daily is None:
        return DEFAULT_OFFER_PERIOD_DAYS
    apr = rate_daily * Decimal(365) * Decimal(100)
    for threshold_apr, days in _period_thresholds_for(preset):
        if apr >= threshold_apr:
            return days
    return DEFAULT_OFFER_PERIOD_DAYS

# Bitfinex method name for USDT-TRX
BITFINEX_USDT_TRX_METHOD = "tetherusx"

# 掛單時想要的 markdown(below market last) — 確保被借方優先接走。
# 0 = 直接照 last;正值 = 比 last 再低一點(更積極搶 match)。
# 5 bps daily = 1.8% APR — 對 FRR 9% APR 環境差別微小,但能保證 fill 速度。
COMPETITIVE_RATE_MARKDOWN_BPS = Decimal("0")

# F-5a-3.2: order-book depth multiplier. We walk the live offer book and
# anchor our rate at the level where cumulative-cheaper-supply equals
# (BOOK_DEPTH_FACTOR × our_amount). At factor 2, we land roughly behind
# 2× our size in the queue — well-positioned for the next borrower wave.
BOOK_DEPTH_FACTOR = Decimal("2")

# F-5a-3.3: ladder mode. Splits a single deposit into K tranches with
# increasing rates. Most of the supply (60%) sits at the depth-aware base
# rate for fast fill; smaller tranches sit at premiums waiting for spike
# events. If market hits a spike, the high-premium tranches fill at
# elevated rates without sacrificing fill speed of the bulk.
#
# Ladder is opt-in by amount: only deposits ≥ MIN_AUTO_LEND_USDT × LADDER_MIN_TRANCHES
# (currently 150 × 5 = 750 USDT) qualify. Below that, single-offer mode
# (legacy) — Bitfinex's per-offer minimum is 150 USDT, so ladder of $200
# would fail with $40 tranches.
#
# Format: list of (fraction_of_amount, rate_multiplier_above_base).
# Fractions must sum to 1.0. Multiplier 1.0 = base rate, 1.5 = 50% above.
#
# F-5a-3.5: per-preset ladder. CONSERVATIVE concentrates supply at low
# multipliers (fast fill, sacrifices spike upside). AGGRESSIVE pushes more
# supply into the high-premium tranches (slower base fill but bigger spike
# capture). BALANCED is the F-5a-3.3 default.
LADDER_TRANCHES_BALANCED: list[tuple[Decimal, Decimal]] = [
    (Decimal("0.60"), Decimal("1.00")),  # baseline (fast fill)
    (Decimal("0.20"), Decimal("1.20")),  # mild spike capture
    (Decimal("0.10"), Decimal("1.50")),  # moderate spike
    (Decimal("0.07"), Decimal("2.00")),  # major spike
    (Decimal("0.03"), Decimal("4.00")),  # extreme liquidation event
]
LADDER_TRANCHES_CONSERVATIVE: list[tuple[Decimal, Decimal]] = [
    (Decimal("0.80"), Decimal("1.00")),  # most weight on baseline (fast fill)
    (Decimal("0.15"), Decimal("1.20")),  # mild spike
    (Decimal("0.05"), Decimal("1.50")),  # moderate spike (last)
]
LADDER_TRANCHES_AGGRESSIVE: list[tuple[Decimal, Decimal]] = [
    (Decimal("0.40"), Decimal("1.00")),  # baseline (smaller bulk)
    (Decimal("0.25"), Decimal("1.20")),  # mild spike (heavier)
    (Decimal("0.15"), Decimal("1.50")),  # moderate spike (heavier)
    (Decimal("0.12"), Decimal("2.00")),  # major spike (heavier)
    (Decimal("0.08"), Decimal("4.00")),  # extreme spike (heavier)
]

# Backward compat alias (BALANCED was the only preset before F-5a-3.5).
LADDER_TRANCHES = LADDER_TRANCHES_BALANCED
LADDER_MIN_TRANCHES = len(LADDER_TRANCHES_BALANCED)  # 5


def _ladder_tranches_for(preset: str) -> list[tuple[Decimal, Decimal]]:
    """Return the (fraction, rate_multiplier) tranche table for a preset."""
    if preset == EarnStrategyPreset.CONSERVATIVE.value:
        return LADDER_TRANCHES_CONSERVATIVE
    if preset == EarnStrategyPreset.AGGRESSIVE.value:
        return LADDER_TRANCHES_AGGRESSIVE
    return LADDER_TRANCHES_BALANCED


# ─────────────────────────────────────────────────────────
# Deposit address fetch + cache
# ─────────────────────────────────────────────────────────


async def refresh_deposit_address(
    db: AsyncSession, earn_account_id: int
) -> FundingDepositAddress:
    """Call Bitfinex API,拿 user funding wallet 的 TRC20 USDT 入金地址,cache 到 DB。

    用於:
      - /earn/connect onboarding 第一次 fetch
      - 每次 broadcast 前 refresh(防止 user 在 Bitfinex 端 rotate 地址)
      - admin manual refresh
    """
    account = await earn_repo.get_account_by_id(db, earn_account_id)
    if account is None:
        raise ValueError(f"earn_account {earn_account_id} not found")

    conn = await earn_repo.get_active_bitfinex_connection(db, earn_account_id)
    if conn is None:
        raise ValueError(f"earn_account {earn_account_id} has no active bitfinex connection")

    adapter = await BitfinexFundingAdapter.from_connection(db, conn)
    fetched = await adapter.get_funding_deposit_address(method=BITFINEX_USDT_TRX_METHOD)

    if account.bitfinex_funding_address != fetched.address:
        logger.info(
            "auto_lend_deposit_address_changed",
            earn_account_id=earn_account_id,
            old=account.bitfinex_funding_address,
            new=fetched.address,
        )
        account.bitfinex_funding_address = fetched.address
        await db.commit()

    return fetched


# ─────────────────────────────────────────────────────────
# Pipeline: dispatcher
# ─────────────────────────────────────────────────────────


async def _outstanding_at_bitfinex(db: AsyncSession, earn_account_id: int) -> Decimal:
    """Sum of amounts currently in flight or held at Bitfinex for this account."""
    active_states = (
        EarnPositionStatus.PENDING_OUTBOUND.value,
        EarnPositionStatus.ONCHAIN_IN_FLIGHT.value,
        EarnPositionStatus.FUNDING_IDLE.value,
        EarnPositionStatus.OFFER_PENDING.value,
        EarnPositionStatus.LENT.value,
        EarnPositionStatus.CLOSING.value,
    )
    q = await db.execute(
        select(EarnPosition.amount).where(
            EarnPosition.earn_account_id == earn_account_id,
            EarnPosition.status.in_(active_states),
        )
    )
    return sum((row[0] for row in q.all()), Decimal("0"))


async def _has_in_flight_position(db: AsyncSession, earn_account_id: int) -> bool:
    """Idempotency guard: don't start a new dispatch if one is mid-pipeline."""
    in_flight_states = (
        EarnPositionStatus.PENDING_OUTBOUND.value,
        EarnPositionStatus.ONCHAIN_IN_FLIGHT.value,
        EarnPositionStatus.FUNDING_IDLE.value,
    )
    q = await db.execute(
        select(EarnPosition.id).where(
            EarnPosition.earn_account_id == earn_account_id,
            EarnPosition.status.in_(in_flight_states),
        ).limit(1)
    )
    return q.scalar_one_or_none() is not None


async def auto_lend_dispatcher(ctx: dict[str, Any], *, user_id: int) -> str:
    """Decide whether to auto-lend for a user, and if yes start the broadcast.

    Returns a short status string for the arq job log.
    """
    from app.core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        account = await earn_repo.get_account_by_user_id(db, user_id)
        if account is None or account.archived_at is not None:
            return "skipped:no_active_account"
        if not account.auto_lend_enabled:
            return "skipped:disabled"
        if not account.bitfinex_funding_address:
            logger.warning("auto_lend_no_deposit_address", earn_account_id=account.id, user_id=user_id)
            return "skipped:no_deposit_address"
        if await _has_in_flight_position(db, account.id):
            return "skipped:in_flight"

        ledger_balance = await get_user_balance(db, user_id)
        outstanding = await _outstanding_at_bitfinex(db, account.id)
        spendable = ledger_balance - outstanding
        if spendable < MIN_AUTO_LEND_USDT:
            return f"skipped:below_min({spendable})"

        # F-5a-3.11: apply user's "保留不借出金額" — keep buffer fraction
        # in the Quiver wallet, only bridge (1 - buffer)% to Bitfinex.
        # The buffer never gets a ledger debit so it stays available for
        # instant withdrawal via /wallet. Round down to keep arithmetic
        # tidy; floor to MIN_AUTO_LEND_USDT to avoid sub-min positions.
        buffer_pct = Decimal(account.usdt_buffer_pct or 0)
        bridge_fraction = (Decimal(100) - buffer_pct) / Decimal(100)
        amount = (spendable * bridge_fraction).quantize(Decimal("0.000001"))
        if amount < MIN_AUTO_LEND_USDT:
            return f"skipped:bridge_below_min(spendable={spendable} buffer={buffer_pct}% bridge={amount})"

        # F-5a-3.11: route new positions to the USD lending market by
        # default. Legacy USDT positions stay USDT (lending_currency=NULL)
        # and continue through their pre-pivot lifecycle until they close
        # naturally on credit maturity.
        position = EarnPosition(
            earn_account_id=account.id,
            status=EarnPositionStatus.PENDING_OUTBOUND.value,
            amount=amount,
            currency="USDT-TRC20",
            lending_currency="USD",
        )
        db.add(position)
        await db.flush()
        await db.commit()
        position_id = position.id
        bitfinex_addr = account.bitfinex_funding_address

    # ─── outside DB tx: broadcast ───
    try:
        tx_hash = await _broadcast_hot_to_address(amount=amount, to_address=bitfinex_addr)
    except Exception as e:
        logger.exception("auto_lend_broadcast_failed", position_id=position_id, error=str(e))
        async with AsyncSessionLocal() as db:
            await _mark_failed(db, position_id, f"broadcast_failed:{e}")
        return f"failed:broadcast:{e}"

    # ─── back in DB: record success + ledger entry + enqueue finalizer ───
    async with AsyncSessionLocal() as db:
        pos = (await db.execute(select(EarnPosition).where(EarnPosition.id == position_id))).scalar_one()
        pos.status = EarnPositionStatus.ONCHAIN_IN_FLIGHT.value
        pos.onchain_tx_hash = tx_hash
        pos.onchain_broadcast_at = datetime.now(timezone.utc)
        await post_earn_outbound(db, user_id=user_id, amount=amount)
        await db.commit()

    await ctx["redis"].enqueue_job(
        "auto_lend_finalizer", position_id=position_id, _defer_by=300
    )
    logger.info(
        "auto_lend_broadcast_ok",
        position_id=position_id,
        user_id=user_id,
        amount=str(amount),
        to=bitfinex_addr,
        tx_hash=tx_hash,
    )
    return f"broadcast:{amount}:{tx_hash}"


async def _mark_failed(db: AsyncSession, position_id: int, reason: str) -> None:
    pos = (await db.execute(select(EarnPosition).where(EarnPosition.id == position_id))).scalar_one()
    pos.status = EarnPositionStatus.FAILED.value
    pos.last_error = reason[:1000]
    pos.closed_at = datetime.now(timezone.utc)
    pos.closed_reason = "failed"
    await db.commit()


# ─────────────────────────────────────────────────────────
# F-5a-3.11: USDT ↔ USD conversion via Bitfinex spot market
# ─────────────────────────────────────────────────────────


async def _convert_usdt_to_usd_in_funding(
    adapter: BitfinexFundingAdapter,
    usdt_amount: Decimal,
) -> Decimal:
    """Convert `usdt_amount` USDT (sitting in funding wallet) to USD,
    leaving the result in the funding/USD wallet ready to lend.

    Three Bitfinex API calls in sequence:
      1. transfer funding/UST → exchange/UST (only exchange wallet trades)
      2. EXCHANGE MARKET sell on tUSTUSD pair (USDT → USD)
      3. transfer exchange/USD → funding/USD (lent from funding wallet)

    Returns the USD amount received (= executed USDT × avg fill price,
    typically 0.999x USDT × ~0.9993 = ~0.999 USD per 1 USDT). Raises if
    any step fails — caller should _mark_failed and let admin recover
    (orphaned funds detection lives in reconcile).

    F-5a-3.11 cost model: tUSTUSD spread ~0.2 bps; market-order taker
    fee 0.1% (or 0.02% maker for limit orders, but we use market for
    speed). Round-trip cost ~0.2% — amortized across the position's
    full lend lifecycle.
    """
    # Step 1: funding → exchange (USDT)
    await adapter.transfer_between_wallets(
        currency="UST",
        amount=usdt_amount,
        from_wallet="funding",
        to_wallet="exchange",
    )

    # Step 2: market sell USDT for USD on tUSTUSD
    result = await adapter.submit_market_order(
        symbol=SYMBOL_SPOT_USDT_USD,
        side="sell",
        amount=usdt_amount,
    )
    executed_usdt = Decimal(str(result.get("executed_amount") or 0))
    avg_price = Decimal(str(result.get("avg_price") or 0))
    if executed_usdt <= 0 or avg_price <= 0:
        raise ValueError(
            f"market sell incomplete: executed={executed_usdt} avg_price={avg_price}"
        )
    usd_received = (executed_usdt * avg_price).quantize(Decimal("0.000001"))

    # Step 3: exchange → funding (USD)
    await adapter.transfer_between_wallets(
        currency="USD",
        amount=usd_received,
        from_wallet="exchange",
        to_wallet="funding",
    )

    logger.info(
        "auto_lend_converted_usdt_to_usd",
        usdt_in=str(usdt_amount),
        usd_out=str(usd_received),
        avg_price=str(avg_price),
        order_id=result.get("order_id"),
    )
    return usd_received


async def _convert_usd_to_usdt_in_funding(
    adapter: BitfinexFundingAdapter,
    usd_amount: Decimal,
) -> Decimal:
    """Reverse direction — used by the redeem endpoint (F-5a-3.11.7).

    Same 3-step pattern but currencies flipped: funding/USD →
    exchange/USD → buy USDT on tUSTUSD → exchange/UST → funding/UST.
    Returns USDT received.
    """
    # Step 1: funding → exchange (USD)
    await adapter.transfer_between_wallets(
        currency="USD",
        amount=usd_amount,
        from_wallet="funding",
        to_wallet="exchange",
    )

    # Step 2: market buy USDT with USD on tUSTUSD
    # For market buy on a pair, the `amount` field is in BASE currency
    # (USDT here). We don't know the exact USDT we'll get without first
    # querying the order book — for MVP, query the ticker to estimate
    # USDT we can buy with our USD.
    ticker_url = f"{API_BASE}/v2/ticker/{SYMBOL_SPOT_USDT_USD}"
    async with httpx.AsyncClient() as client:
        ticker_resp = await client.get(ticker_url, timeout=10.0)
        ticker_resp.raise_for_status()
        ticker = ticker_resp.json()
    ask_price = Decimal(str(ticker[2]))  # ASK = price to buy USDT
    estimated_usdt = (usd_amount / ask_price).quantize(Decimal("0.000001"))
    # Reserve a small buffer (0.5%) so we don't try to buy more than we
    # can afford if the price ticks up between query and submit.
    target_usdt = (estimated_usdt * Decimal("0.995")).quantize(Decimal("0.000001"))

    result = await adapter.submit_market_order(
        symbol=SYMBOL_SPOT_USDT_USD,
        side="buy",
        amount=target_usdt,
    )
    executed_usdt = Decimal(str(result.get("executed_amount") or 0))
    avg_price = Decimal(str(result.get("avg_price") or 0))
    if executed_usdt <= 0:
        raise ValueError(f"market buy got no fill: result={result}")

    # Step 3: exchange → funding (USDT)
    await adapter.transfer_between_wallets(
        currency="UST",
        amount=executed_usdt,
        from_wallet="exchange",
        to_wallet="funding",
    )

    logger.info(
        "redeem_converted_usd_to_usdt",
        usd_in=str(usd_amount),
        usdt_out=str(executed_usdt),
        avg_price=str(avg_price),
        order_id=result.get("order_id"),
    )
    return executed_usdt


# ─────────────────────────────────────────────────────────
# Pipeline: finalizer
# ─────────────────────────────────────────────────────────

# How many times to retry waiting for Bitfinex credit before giving up.
# Each retry defers 5min, so 12 = 60min total wait window.
MAX_FINALIZER_RETRIES = 12


async def auto_lend_finalizer(ctx: dict[str, Any], *, position_id: int) -> str:
    """Verify Bitfinex received the broadcast, then submit funding offer.

    Re-enqueues itself with backoff if Bitfinex hasn't credited yet.
    """
    from app.core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        pos = (await db.execute(select(EarnPosition).where(EarnPosition.id == position_id))).scalar_one_or_none()
        if pos is None:
            return "skipped:not_found"
        if pos.status != EarnPositionStatus.ONCHAIN_IN_FLIGHT.value:
            return f"skipped:wrong_status({pos.status})"

        account = await earn_repo.get_account_by_id(db, pos.earn_account_id)
        if account is None:
            await _mark_failed(db, position_id, "earn_account_missing")
            return "failed:no_account"

        conn = await earn_repo.get_active_bitfinex_connection(db, account.id)
        if conn is None:
            await _mark_failed(db, position_id, "bitfinex_connection_missing")
            return "failed:no_connection"

        adapter = await BitfinexFundingAdapter.from_connection(db, conn)
        position_amount = pos.amount
        retry_count = pos.retry_count
        strategy_preset = account.strategy_preset
        user_id = account.user_id  # for F-5a-4.1 telegram notification
        # F-5a-3.11: route based on lending_currency. NULL → legacy USDT.
        lending_currency = (pos.lending_currency or "USDT").upper()
        is_usd_path = lending_currency == "USD"

    # ─── outside DB: hit Bitfinex ───
    try:
        # USDT credit comes into funding/UST regardless of which lending
        # market the position will end up in — we need to verify the bridge
        # arrived before we can convert / lend.
        bf_position = await adapter.get_funding_position(currency="UST")
    except Exception as e:
        logger.warning(
            "auto_lend_finalizer_bf_query_failed",
            position_id=position_id,
            error=str(e),
        )
        return await _maybe_retry(ctx, position_id, retry_count, f"bf_query:{e}")

    # tolerance: Bitfinex may show slightly less due to rounding / fee
    funding_idle = bf_position.funding_balance
    if funding_idle + Decimal("0.5") < position_amount:
        return await _maybe_retry(
            ctx, position_id, retry_count,
            f"not_credited(funding={funding_idle} expected={position_amount})",
        )

    # Credit confirmed; transition to funding_idle, then submit offer
    async with AsyncSessionLocal() as db:
        pos = (await db.execute(select(EarnPosition).where(EarnPosition.id == position_id))).scalar_one()
        pos.status = EarnPositionStatus.FUNDING_IDLE.value
        pos.bitfinex_credited_at = datetime.now(timezone.utc)
        await db.commit()

    # F-5a-3.11 USD-pivot leg: if this position is USD-routed, convert
    # USDT → USD via spot market before submitting the funding offer.
    # The position's `amount` becomes USD post-conversion (slightly less
    # than original USDT due to spread + fee, ~0.999×).
    offer_amount = position_amount  # USDT amount by default
    offer_currency = "UST"
    if is_usd_path:
        async with AsyncSessionLocal() as db:
            pos = (await db.execute(select(EarnPosition).where(EarnPosition.id == position_id))).scalar_one()
            pos.status = EarnPositionStatus.CONVERTING_TO_USD.value
            await db.commit()
        try:
            usd_received = await _convert_usdt_to_usd_in_funding(
                adapter=adapter, usdt_amount=position_amount
            )
        except Exception as e:
            logger.exception(
                "auto_lend_conversion_failed",
                position_id=position_id,
                usdt_amount=str(position_amount),
                error=str(e),
            )
            # Conversion failure is hard to auto-recover (funds may be
            # stuck in exchange wallet). Mark FAILED + alert; admin tools
            # / reconcile orphan-detection will recover.
            async with AsyncSessionLocal() as db:
                await _mark_failed(db, position_id, f"convert_usdt_to_usd:{e}"[:200])
            return f"failed:convert:{e}"
        # Update position to USD amount + record the conversion outcome.
        async with AsyncSessionLocal() as db:
            pos = (await db.execute(select(EarnPosition).where(EarnPosition.id == position_id))).scalar_one()
            pos.amount = usd_received  # now denominated in USD
            await db.commit()
        offer_amount = usd_received
        offer_currency = "USD"

    # F-5a-3.10 + 3.11: per-period market signals + strategy_selector,
    # now currency-aware (fUSD signals when offer_currency=USD).
    from app.services.earn.market_signals import get_market_signals
    from app.services.earn.strategy_selector import select_strategy, to_legacy_ladder

    signals = await get_market_signals(currency=offer_currency)
    market = await fetch_market_frr(symbol=f"f{offer_currency}")
    frr_daily = market.frr_daily if market is not None else None
    decision = select_strategy(
        amount=offer_amount,
        preset=strategy_preset,
        signals=signals,
        frr_daily=frr_daily,
    )
    logger.info(
        "auto_lend_strategy_selected",
        position_id=position_id,
        amount=str(position_amount),
        preset=strategy_preset,
        frr_daily=str(frr_daily) if frr_daily else "unavailable",
        tranche_count=len(decision.tranches),
        fallback_used=decision.fallback_used,
        avg_apr=str(decision.total_apr_estimate_pct),
        notes=list(decision.notes),
    )
    ladder = to_legacy_ladder(decision)
    try:
        offer_ids = await _submit_ladder(
            adapter=adapter,
            ladder=ladder,
            currency=offer_currency,
        )
    except Exception as e:
        logger.exception(
            "auto_lend_submit_offer_failed",
            position_id=position_id,
            error=str(e),
        )
        # 常見原因:Bitfinex 對剛 cancel 的 offer 有 1-2 min settling 延遲,
        # 期間 wallet.available=0 但 wallet.balance=200。re-enqueue 重試。
        return await _maybe_retry(ctx, position_id, retry_count, f"submit_offer:{e}"[:200])

    async with AsyncSessionLocal() as db:
        pos = (await db.execute(select(EarnPosition).where(EarnPosition.id == position_id))).scalar_one()
        # F-5a-3.8: status starts as OFFER_PENDING (offer submitted, not yet
        # matched). reconcile flips this to LENT once Bitfinex shows an active
        # funding credit for this position. This makes the UI honest — the
        # user sees "掛單中" until a borrower actually picks up the offer,
        # not "已借出, 計息中" while still waiting.
        pos.status = EarnPositionStatus.OFFER_PENDING.value
        # Primary tranche (largest, lowest rate) for backward compat
        pos.bitfinex_offer_id = offer_ids[0]
        # Full ladder list as JSON for reconcile to track all tranches
        pos.bitfinex_offer_ids = json.dumps(offer_ids)
        pos.bitfinex_offer_submitted_at = datetime.now(timezone.utc)
        await db.commit()
    offer_id = offer_ids[0]  # alias used in log line below

    logger.info(
        "auto_lend_offer_submitted",
        position_id=position_id,
        offer_id=offer_id,
        amount=str(position_amount),
    )

    # F-5a-4.1: fire-and-forget telegram notification. We don't await because
    # a Telegram outage / 5xx must NEVER fail the auto-lend (the offer is
    # already on Bitfinex, the rest is just user comms). asyncio.create_task
    # schedules the coroutine to run on the next event loop iteration; any
    # exception inside is logged by the service itself.
    # F-5a-4.2: kind="fresh" distinguishes from auto-renew (reconcile path).
    from app.services.earn import notifications as earn_notifications

    asyncio.create_task(
        earn_notifications.notify_lent_event(
            user_id=user_id,
            ladder=ladder,
            offer_ids=offer_ids,
            kind="fresh",
        )
    )

    # F-5b-4 funnel — first_lent_succeeded (track_once so multi-loops don't
    # re-fire). Fresh DB session because the request session is closed by now.
    async with AsyncSessionLocal() as funnel_db:
        from app.services import funnel
        inserted = await funnel.track_once(
            funnel_db, user_id, funnel.FIRST_LENT_SUCCEEDED,
            properties={"position_id": position_id, "offer_id": offer_id},
        )
        if inserted:
            await funnel_db.commit()

    return f"lent:{offer_id}"


def _build_ladder(
    amount: Decimal,
    base_rate: Decimal | None,
    preset: str = EarnStrategyPreset.BALANCED.value,
) -> list[tuple[Decimal, Decimal | None, int]]:
    """Slice `amount` into K tranches at increasing rates per the preset table.

    Returns list of (chunk_amount, chunk_rate, period_days). Each tranche
    has its own period chosen by `_select_period_days(chunk_rate, preset)` so
    high-rate tranches lock their elevated yield for longer (F-5a-3.4 dynamic
    period strategy), with the threshold table picked by `preset` (F-5a-3.5).

    F-5a-3.7: the base tranche (multiplier == 1.0×) and the single-offer
    fallback both submit with rate=None, which Bitfinex treats as a *FRR
    market order* — auto-matches at the prevailing FRR with platform-side
    matching priority. This replaces the F-5a-3.2 depth-walk anchor for the
    base tranche, which was costing realised rate by undercutting cheap top-of
    -book offers (PoC poc_pricing_compare.py measured -27% to -6% vs FRR for
    sub-$5K offers in May 2026 conditions). Higher tranches (≥1.2×) keep
    their fixed-rate-above-FRR semantics — they want to be price-takers from
    elevated demand, not get auto-matched.

    Eligibility:
      - amount >= floor where smallest_fraction × amount >= MIN_AUTO_LEND_USDT
        → laddered (K tuples). For BALANCED that's amount >= $5000 (smallest
        fraction 3%); CONSERVATIVE qualifies earlier ($3000 — smallest 5%);
        AGGRESSIVE later ($1875 — smallest 8%).
      - else → single tuple [(amount, None, period)] — FRR market order
      - base_rate is None → single tuple at FRR (no rate computation possible)

    Per-tranche minimum: MIN_AUTO_LEND_USDT (Bitfinex platform rule).

    `preset` defaults to BALANCED for backward compat with callers / tests
    that don't pass one (matches pre-F-5a-3.5 behaviour exactly).
    """
    table = _ladder_tranches_for(preset)
    # Single-offer fallbacks — always FRR market order (F-5a-3.7)
    if base_rate is None:
        return [(amount, None, _select_period_days(None, preset))]
    smallest_fraction = min(frac for frac, _ in table)
    smallest_chunk = amount * smallest_fraction
    if smallest_chunk < MIN_AUTO_LEND_USDT:
        # F-5a-3.7: rate=None instead of base_rate — let Bitfinex auto-match
        # at FRR rather than fix-priced below-book.
        return [(amount, None, _select_period_days(base_rate, preset))]

    # Build laddered tranches
    tranches: list[tuple[Decimal, Decimal | None, int]] = []
    cumulative = Decimal(0)
    for i, (frac, mult) in enumerate(table):
        # Last tranche absorbs rounding to ensure exact total
        if i == len(table) - 1:
            chunk = amount - cumulative
        else:
            chunk = (amount * frac).quantize(Decimal("0.01"))
            cumulative += chunk
        if mult == Decimal("1.00"):
            # F-5a-3.7: base tranche → FRR market order (rate=None).
            # Period selection still uses base_rate (== current FRR) to pick
            # bucket — at FRR < 5% APR the market is cold, lock 2 days for
            # fast reprice; at FRR > 15% it's hot, lock 30.
            rate_for_offer: Decimal | None = None
            period = _select_period_days(base_rate, preset)
        else:
            # Higher tranches → fixed rate above FRR (price-taker for spike events)
            rate_for_offer = base_rate * mult
            period = _select_period_days(rate_for_offer, preset)
        tranches.append((chunk, rate_for_offer, period))
    return tranches


async def _submit_ladder(
    *,
    adapter: BitfinexFundingAdapter,
    ladder: list[tuple[Decimal, Decimal | None, int]],
    currency: str = "UST",
) -> list[int]:
    """Submit each tranche as a separate Bitfinex offer. Returns list of
    offer IDs in submission order (first = primary tranche).

    F-5a-3.11: `currency` selects the funding pair — "UST" → fUST (legacy),
    "USD" → fUSD. Existing callers default to UST so legacy paths are
    unchanged.

    Period is now per-tranche (F-5a-3.4 dynamic days) — each tuple carries
    its own period_days from the ladder builder.

    Sequential, not concurrent — Bitfinex rejects API calls that arrive
    too close together with the same nonce; sequential is safer.

    If ANY tranche fails, raises and caller retries the whole pipeline
    (the failed tranches won't have offer IDs and the prior successful
    ones become orphans we'd need to manually clean up — for MVP we accept
    this risk; future hardening will add rollback).
    """
    from app.services.earn.bitfinex_adapter import funding_symbol

    symbol = funding_symbol(currency)
    offer_ids: list[int] = []
    for i, (chunk_amount, chunk_rate, chunk_period) in enumerate(ladder):
        offer_id = await adapter.submit_funding_offer(
            amount=chunk_amount,
            period_days=chunk_period,
            rate=chunk_rate,
            symbol=symbol,
        )
        offer_ids.append(offer_id)
        logger.info(
            "auto_lend_ladder_tranche_submitted",
            tranche_idx=i,
            tranche_count=len(ladder),
            currency=currency,
            symbol=symbol,
            amount=str(chunk_amount),
            rate_daily=str(chunk_rate) if chunk_rate is not None else "FRR",
            apr_pct=(
                str(chunk_rate * Decimal(365) * Decimal(100))
                if chunk_rate is not None
                else "FRR"
            ),
            period_days=chunk_period,
            offer_id=offer_id,
        )
    return offer_ids


async def _compute_competitive_rate(
    amount: Decimal | None = None,
) -> Decimal | None:
    """Compute a funding rate likely to clear quickly while keeping yield healthy.

    F-5a-3.2: order-book-aware. Walks the live `/v2/book/fUST/P0` and finds
    the rate at the depth where cumulative-cheaper-offer-supply ≥
    (BOOK_DEPTH_FACTOR × our amount). Anchoring to that depth means our offer
    sits ~2× our size deep in the queue — close enough to the front to fill
    on the next reasonable borrower wave, but not undercutting all the
    cheaper lenders unnecessarily.

    Why depth-aware vs. plain `ask_daily`:
      ask_daily is the top-of-book rate, but the top offer might be tiny
      (e.g. $50 at 4.5%). If we post $5000 at 4.5%, our offer would push to
      a deeper price level the moment a borrower hits the small offer first.
      Walking the book lets us anchor to where we'd actually land.

    Fallback chain (if Bitfinex API hiccups):
      book → ticker ask_daily → ticker last_daily → None
    None signals "use FRR"; the caller can pass rate=None to submit_offer.

    `amount` arg is optional for backward compat; if omitted we walk to a
    fixed depth slot (= a small reference amount).
    """
    # ── try order book first (F-5a-3.2 path) ──
    if amount is not None and amount > 0:
        try:
            book = await fetch_funding_book()
        except Exception as e:  # noqa: BLE001
            logger.warning("auto_lend_book_fetch_failed", error=str(e))
            book = []
        if book:
            target_depth = amount * BOOK_DEPTH_FACTOR
            cumulative = Decimal(0)
            for offer in book:  # ascending by rate (cheapest first)
                cumulative += offer.amount
                if cumulative >= target_depth:
                    rate = offer.rate_daily - (
                        COMPETITIVE_RATE_MARKDOWN_BPS / Decimal(10000)
                    )
                    final = rate if rate > 0 else offer.rate_daily
                    logger.info(
                        "auto_lend_book_anchor",
                        amount=str(amount),
                        target_depth=str(target_depth),
                        landing_rate_daily=str(final),
                        landing_apr=str(final * Decimal(365) * Decimal(100)),
                        depth_offers_walked=book.index(offer) + 1,
                    )
                    return final
            # Book is thin — couldn't accumulate target depth. Use the
            # deepest (most aggressive) offer as our anchor.
            logger.info(
                "auto_lend_book_thin_using_deepest",
                amount=str(amount),
                book_total=str(cumulative),
                deepest_rate_daily=str(book[-1].rate_daily),
            )
            return book[-1].rate_daily

    # ── fallback to ticker (legacy path / book unavailable) ──
    market = await fetch_market_frr()
    if market is None:
        logger.warning("auto_lend_market_fetch_failed_falling_back_to_frr")
        return None
    if market.ask_daily > 0:
        rate = market.ask_daily - (COMPETITIVE_RATE_MARKDOWN_BPS / Decimal(10000))
        return rate if rate > 0 else market.ask_daily
    if market.last_daily > 0:
        logger.info("auto_lend_no_ask_using_last", last=str(market.last_daily))
        return market.last_daily
    return None


async def _maybe_retry(
    ctx: dict[str, Any], position_id: int, retry_count: int, reason: str
) -> str:
    """Re-enqueue finalizer with backoff, or give up after MAX_FINALIZER_RETRIES."""
    from app.core.db import AsyncSessionLocal

    if retry_count >= MAX_FINALIZER_RETRIES:
        async with AsyncSessionLocal() as db:
            await _mark_failed(db, position_id, f"finalizer_timeout:{reason}")
        return f"failed:timeout:{reason}"

    async with AsyncSessionLocal() as db:
        pos = (await db.execute(select(EarnPosition).where(EarnPosition.id == position_id))).scalar_one()
        pos.retry_count = retry_count + 1
        pos.last_error = reason[:1000]
        await db.commit()

    await ctx["redis"].enqueue_job(
        "auto_lend_finalizer", position_id=position_id, _defer_by=300
    )
    return f"retry:{retry_count + 1}:{reason}"


# ─────────────────────────────────────────────────────────
# Broadcast helper (HOT → external Tron address)
# ─────────────────────────────────────────────────────────


async def _broadcast_hot_to_address(*, amount: Decimal, to_address: str) -> str:
    """Send USDT-TRC20 from HOT to an external address (here: user's Bitfinex
    funding deposit address).

    Pattern mirrors sweep.py:80-122 but source = HOT (signed by hot_priv) and
    we need to ensure HOT has enough TRX for gas.

    Returns the broadcast tx hash.
    """
    from app.core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        master_seed = await _load_master_seed(db)
        try:
            hot_addr = _derive_platform_hot_wallet_address(master_seed)
            hot_priv = _derive_hot_wallet_private_key_hex(master_seed)
            fp_addr = _derive_platform_fee_payer_address(master_seed)
            fp_priv = _derive_fee_payer_private_key_hex(master_seed)
        finally:
            master_seed = b"\x00" * len(master_seed)  # noqa: F841

    try:
        # Step 1: ensure HOT has enough TRX for gas
        try:
            hot_trx = await tatum.get_trx_balance(hot_addr)
        except TatumError:
            hot_trx = Decimal("0")

        if hot_trx < HOT_TRX_MIN_FOR_BROADCAST:
            top_up = HOT_TRX_MIN_FOR_BROADCAST - hot_trx
            logger.info(
                "auto_lend_hot_trx_top_up",
                hot=hot_addr,
                top_up=str(top_up),
            )
            await tatum.send_trx(fp_priv, hot_addr, top_up)
            await asyncio.sleep(12)  # wait for top-up to land

        # Step 2: send USDT
        logger.info(
            "auto_lend_send_usdt",
            from_addr=hot_addr,
            to_addr=to_address,
            amount=str(amount),
        )
        tx_hash = await tatum.send_trc20(
            hot_priv,
            to_address,
            settings.usdt_contract,
            amount,
            fee_limit_trx=100,
        )
    except (TatumError, TatumNotConfigured) as e:
        raise RuntimeError(f"tatum_send_failed: {e}") from e
    finally:
        hot_priv = "0" * 64  # noqa: F841
        fp_priv = "0" * 64  # noqa: F841

    return tx_hash
