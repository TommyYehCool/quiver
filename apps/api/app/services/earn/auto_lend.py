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
)
from app.services import tatum
from app.services.earn import repo as earn_repo
from app.services.earn.bitfinex_adapter import (
    BitfinexFundingAdapter,
    FundingDepositAddress,
)
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

# Default funding offer params
DEFAULT_OFFER_PERIOD_DAYS = 2

# Bitfinex method name for USDT-TRX
BITFINEX_USDT_TRX_METHOD = "tetherusx"


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

        amount = spendable  # send everything spendable that's ≥ min

        # Reserve the slot: create earn_position before broadcasting,
        # so a concurrent dispatcher invocation sees in_flight = True.
        position = EarnPosition(
            earn_account_id=account.id,
            status=EarnPositionStatus.PENDING_OUTBOUND.value,
            amount=amount,
            currency="USDT-TRC20",
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

    # ─── outside DB: hit Bitfinex ───
    try:
        bf_position = await adapter.get_funding_position()
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

    try:
        offer_id = await adapter.submit_funding_offer(
            amount=position_amount,
            period_days=DEFAULT_OFFER_PERIOD_DAYS,
        )
    except Exception as e:
        logger.exception("auto_lend_submit_offer_failed", position_id=position_id, error=str(e))
        async with AsyncSessionLocal() as db:
            pos = (await db.execute(select(EarnPosition).where(EarnPosition.id == position_id))).scalar_one()
            pos.last_error = f"submit_offer_failed:{e}"[:1000]
            pos.retry_count = retry_count + 1
            await db.commit()
        # leave status = funding_idle, retry later via reconciliation
        return f"failed:submit_offer:{e}"

    async with AsyncSessionLocal() as db:
        pos = (await db.execute(select(EarnPosition).where(EarnPosition.id == position_id))).scalar_one()
        pos.status = EarnPositionStatus.LENT.value
        pos.bitfinex_offer_id = offer_id
        pos.bitfinex_offer_submitted_at = datetime.now(timezone.utc)
        await db.commit()

    logger.info(
        "auto_lend_offer_submitted",
        position_id=position_id,
        offer_id=offer_id,
        amount=str(position_amount),
    )
    return f"lent:{offer_id}"


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
