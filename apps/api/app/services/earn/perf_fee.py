"""Path A perf_fee accrual + settlement (F-4b).

Two phases per cycle:

1. **Accrue** — for each active earn_account with `perf_fee_bps > 0`, sum the
   user's `bitfinex_daily_earned` snapshots over the previous period, multiply
   by `perf_fee_pct`, write an `EarnFeeAccrual` row with status=ACCRUED.

2. **Settle** — for each ACCRUED accrual whose user has sufficient Quiver
   wallet balance, post an EARN_PERF_FEE ledger transaction (DR USER, CR
   PLATFORM_FEE_REVENUE), mark accrual PAID, and trigger referral payouts
   (10% L1 + 5% L2 of the perf_fee amount, walking up the referrer chain).

Accrual cadence is **weekly** (Mondays 02:00 UTC, period = previous Mon-Sun).
Snapshot-based estimate is good enough for V1; future work can switch to
Bitfinex actual loan history for precision.

Settlement runs in the same cron right after accrual. If user wallet balance
< accrual amount, the row stays ACCRUED and gets retried next week.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.earn import (
    EarnAccount,
    EarnFeeAccrual,
    EarnPositionSnapshot,
    FeeAccrualStatus,
    FeePaidMethod,
)
from app.models.user import User
from app.services import ledger as ledger_service

logger = get_logger(__name__)


@dataclass
class AccrualResult:
    accrual_id: int
    user_id: int
    earnings_amount: Decimal  # gross interest in period
    fee_amount: Decimal       # what user owes


@dataclass
class SettleResult:
    accrual_id: int
    user_id: int
    fee_amount: Decimal
    settled: bool
    reason: str | None  # "insufficient_balance" / None on success
    referral_payouts_count: int  # 0, 1, or 2


# ─────────────────────────────────────────────────────────
# Accrual phase
# ─────────────────────────────────────────────────────────


async def accrue_period(
    db: AsyncSession,
    *,
    period_start: date,
    period_end: date,
) -> list[AccrualResult]:
    """For every active earn_account with perf_fee_bps > 0, accrue the period's
    perf_fee from snapshot daily-earned sum.

    Idempotent: the (account_id, period_start, period_end) unique constraint on
    EarnFeeAccrual prevents double-accrual. If a row already exists, skip.
    """
    # Late import to keep services/earn/perf_fee.py from depending on
    # subscription package at module-import time.
    from app.services.premium import repo as sub_repo

    q = await db.execute(
        select(EarnAccount).where(
            EarnAccount.archived_at.is_(None),
            EarnAccount.perf_fee_bps > 0,
        )
    )
    accounts = list(q.scalars().all())
    results: list[AccrualResult] = []

    for account in accounts:
        # F-4c: skip accrual if user has active subscription. ACTIVE/PAST_DUE
        # within current_period_end count. Simple "now-time" check; future
        # work could check day-by-day for partial-month sub starts.
        if await sub_repo.is_user_premium(db, account.user_id):
            logger.info(
                "perf_fee_accrual_skipped_premium",
                account_id=account.id,
                user_id=account.user_id,
                period_start=str(period_start),
                period_end=str(period_end),
            )
            continue

        # Skip if already accrued for this period (idempotency)
        existing_q = await db.execute(
            select(EarnFeeAccrual.id).where(
                EarnFeeAccrual.earn_account_id == account.id,
                EarnFeeAccrual.period_start == period_start,
                EarnFeeAccrual.period_end == period_end,
            )
        )
        if existing_q.scalar_one_or_none() is not None:
            continue

        # Sum bitfinex_daily_earned snapshots in [period_start, period_end].
        # Snapshot-based estimate; future work: pull actual interest from
        # Bitfinex /v2/auth/r/funding/loans/hist.
        sum_q = await db.execute(
            select(
                func.coalesce(func.sum(EarnPositionSnapshot.bitfinex_daily_earned), 0)
            ).where(
                EarnPositionSnapshot.earn_account_id == account.id,
                EarnPositionSnapshot.snapshot_date >= period_start,
                EarnPositionSnapshot.snapshot_date <= period_end,
            )
        )
        earnings = Decimal(sum_q.scalar_one() or 0)
        if earnings <= 0:
            continue

        fee_amount = earnings * account.perf_fee_pct
        # Round to 18 decimal places (Numeric(38,18) column)
        fee_amount = fee_amount.quantize(Decimal("0.000000000000000001"))
        if fee_amount <= 0:
            continue

        accrual = EarnFeeAccrual(
            earn_account_id=account.id,
            period_start=period_start,
            period_end=period_end,
            earnings_amount=earnings,
            fee_bps_applied=account.perf_fee_bps,
            fee_amount=fee_amount,
            status=FeeAccrualStatus.ACCRUED.value,
        )
        db.add(accrual)
        await db.flush()

        results.append(
            AccrualResult(
                accrual_id=accrual.id,
                user_id=account.user_id,
                earnings_amount=earnings,
                fee_amount=fee_amount,
            )
        )
        logger.info(
            "perf_fee_accrued",
            accrual_id=accrual.id,
            account_id=account.id,
            user_id=account.user_id,
            period_start=str(period_start),
            period_end=str(period_end),
            earnings=str(earnings),
            fee_bps=account.perf_fee_bps,
            fee_amount=str(fee_amount),
        )

    return results


# ─────────────────────────────────────────────────────────
# Settlement phase
# ─────────────────────────────────────────────────────────


async def settle_outstanding(db: AsyncSession) -> list[SettleResult]:
    """For each ACCRUED EarnFeeAccrual, try to deduct from user's Quiver wallet.

    On success:
      - Post EARN_PERF_FEE ledger tx (DR USER, CR PLATFORM_FEE_REVENUE)
      - Mark accrual PAID with paid_method=PLATFORM_DEDUCTION
      - Trigger referral payouts (L1 + L2) — sets revshare window timestamps on
        first-ever accrual for that referee
    On insufficient balance: leave ACCRUED, retry next cron.
    """
    # Late import: avoid cycle (referral.payout imports from ledger which is
    # already imported here; referral.repo imports User; etc.)
    from app.services.referral import payout as referral_payout

    q = await db.execute(
        select(EarnFeeAccrual, EarnAccount)
        .join(EarnAccount, EarnAccount.id == EarnFeeAccrual.earn_account_id)
        .where(EarnFeeAccrual.status == FeeAccrualStatus.ACCRUED.value)
        .order_by(EarnFeeAccrual.id)
    )
    rows = list(q.all())
    results: list[SettleResult] = []

    for accrual, account in rows:
        balance = await ledger_service.get_user_balance(db, account.user_id)
        if balance < accrual.fee_amount:
            logger.warning(
                "perf_fee_settle_insufficient_balance",
                accrual_id=accrual.id,
                user_id=account.user_id,
                fee_amount=str(accrual.fee_amount),
                balance=str(balance),
            )
            results.append(
                SettleResult(
                    accrual_id=accrual.id,
                    user_id=account.user_id,
                    fee_amount=accrual.fee_amount,
                    settled=False,
                    reason="insufficient_balance",
                    referral_payouts_count=0,
                )
            )
            continue

        # Post the perf_fee ledger transaction
        await ledger_service.post_perf_fee(
            db, user_id=account.user_id, amount=accrual.fee_amount
        )
        accrual.status = FeeAccrualStatus.PAID.value
        accrual.paid_at = datetime.now(timezone.utc)
        accrual.paid_method = FeePaidMethod.PLATFORM_DEDUCTION.value
        await db.flush()

        # Trigger referral revshare (L1 + L2). Returns count of payouts made.
        payouts_n = await referral_payout.compute_and_apply_payouts(
            db,
            referee_user_id=account.user_id,
            earn_fee_accrual_id=accrual.id,
            perf_fee_amount=accrual.fee_amount,
        )

        await db.commit()
        results.append(
            SettleResult(
                accrual_id=accrual.id,
                user_id=account.user_id,
                fee_amount=accrual.fee_amount,
                settled=True,
                reason=None,
                referral_payouts_count=payouts_n,
            )
        )
        logger.info(
            "perf_fee_settled",
            accrual_id=accrual.id,
            user_id=account.user_id,
            fee_amount=str(accrual.fee_amount),
            referral_payouts=payouts_n,
        )

    return results


# ─────────────────────────────────────────────────────────
# Cron entry point
# ─────────────────────────────────────────────────────────


def previous_iso_week_range(today: date | None = None) -> tuple[date, date]:
    """Return (Monday, Sunday) of the ISO week BEFORE the one containing `today`.

    If today is Monday 2026-05-04, this returns (2026-04-27, 2026-05-03).
    """
    if today is None:
        today = datetime.now(timezone.utc).date()
    # weekday(): Monday=0, Sunday=6
    days_since_monday = today.weekday()
    this_monday = today - timedelta(days=days_since_monday)
    prev_monday = this_monday - timedelta(days=7)
    prev_sunday = this_monday - timedelta(days=1)
    return prev_monday, prev_sunday


# ─────────────────────────────────────────────────────────
# F-5b-2 — Dunning state machine
# ─────────────────────────────────────────────────────────

# Threshold at which Quiver auto-pauses an account's auto-lend due to
# unpaid weekly accruals. Each accrual = 1 week, so 4 = ~1 month of arrears.
DUNNING_PAUSE_THRESHOLD_WEEKS = 4


@dataclass
class DunningTransition:
    """Audit record of a dunning state change for a single account."""
    earn_account_id: int
    user_id: int
    pending_count: int
    pending_amount: Decimal
    action: str  # "paused" | "resumed"


async def evaluate_dunning(db: AsyncSession) -> list[DunningTransition]:
    """For each earn_account, decide whether to pause or auto-resume auto-lend
    based on remaining unpaid (ACCRUED) accruals.

    Rules:
      - pending_count >= DUNNING_PAUSE_THRESHOLD_WEEKS (4)
        AND auto_lend_enabled is true
        AND not currently dunning_pause_active
        → pause: set both auto_lend_enabled=false + dunning_pause_active=true
      - pending_count == 0 AND dunning_pause_active is true
        → resume: set both auto_lend_enabled=true + dunning_pause_active=false

    User-initiated toggle off (auto_lend_enabled=false WITHOUT pause_active)
    is respected — we don't touch it. Same for accounts with 1-3 pending
    rows (just a warning state, no action yet).

    Designed to be idempotent — running twice in a row is a no-op for
    accounts already in their target state.
    """
    from app.models.earn import EarnAccount, EarnFeeAccrual, FeeAccrualStatus

    # Pull all (account, pending_count) pairs in one query.
    q = await db.execute(
        select(
            EarnAccount,
            func.count(EarnFeeAccrual.id).filter(
                EarnFeeAccrual.status == FeeAccrualStatus.ACCRUED.value
            ).label("pending_count"),
            func.coalesce(
                func.sum(EarnFeeAccrual.fee_amount).filter(
                    EarnFeeAccrual.status == FeeAccrualStatus.ACCRUED.value
                ),
                0,
            ).label("pending_amount"),
        )
        .outerjoin(EarnFeeAccrual, EarnFeeAccrual.earn_account_id == EarnAccount.id)
        .where(EarnAccount.archived_at.is_(None))
        .group_by(EarnAccount.id)
    )

    transitions: list[DunningTransition] = []
    for account, pending_count, pending_amount in q.all():
        pending_count = int(pending_count or 0)
        pending_amount = Decimal(str(pending_amount or 0))

        should_pause = (
            pending_count >= DUNNING_PAUSE_THRESHOLD_WEEKS
            and account.auto_lend_enabled
            and not account.dunning_pause_active
        )
        should_resume = pending_count == 0 and account.dunning_pause_active

        if should_pause:
            account.auto_lend_enabled = False
            account.dunning_pause_active = True
            await db.flush()
            transitions.append(
                DunningTransition(
                    earn_account_id=account.id,
                    user_id=account.user_id,
                    pending_count=pending_count,
                    pending_amount=pending_amount,
                    action="paused",
                )
            )
            logger.warning(
                "perf_fee_dunning_paused",
                earn_account_id=account.id,
                user_id=account.user_id,
                pending_count=pending_count,
                pending_amount=str(pending_amount),
                threshold_weeks=DUNNING_PAUSE_THRESHOLD_WEEKS,
            )
        elif should_resume:
            account.auto_lend_enabled = True
            account.dunning_pause_active = False
            await db.flush()
            transitions.append(
                DunningTransition(
                    earn_account_id=account.id,
                    user_id=account.user_id,
                    pending_count=0,
                    pending_amount=Decimal("0"),
                    action="resumed",
                )
            )
            logger.info(
                "perf_fee_dunning_resumed",
                earn_account_id=account.id,
                user_id=account.user_id,
            )

    if transitions:
        await db.commit()
    return transitions


# ─────────────────────────────────────────────────────────
# Cron entry point
# ─────────────────────────────────────────────────────────


async def run_weekly_perf_fee_cycle(db: AsyncSession) -> dict[str, int]:
    """One full weekly cycle: accrue previous week + settle all outstanding +
    evaluate dunning state.

    Returns counts for telemetry.
    """
    period_start, period_end = previous_iso_week_range()
    logger.info(
        "perf_fee_cycle_starting",
        period_start=str(period_start),
        period_end=str(period_end),
    )
    accrued = await accrue_period(
        db, period_start=period_start, period_end=period_end
    )
    await db.commit()

    settled = await settle_outstanding(db)

    # F-5b-2: after settlement, evaluate dunning state. Has to happen AFTER
    # settle (so resumed-on-payment is visible immediately, not stuck for
    # another week).
    transitions = await evaluate_dunning(db)

    settled_ok = sum(1 for r in settled if r.settled)
    settled_skip = sum(1 for r in settled if not r.settled)
    payouts_total = sum(r.referral_payouts_count for r in settled)
    paused_n = sum(1 for t in transitions if t.action == "paused")
    resumed_n = sum(1 for t in transitions if t.action == "resumed")

    logger.info(
        "perf_fee_cycle_done",
        accrued=len(accrued),
        settled_ok=settled_ok,
        settled_skip_insufficient=settled_skip,
        referral_payouts_total=payouts_total,
        dunning_paused=paused_n,
        dunning_resumed=resumed_n,
    )
    return {
        "accrued": len(accrued),
        "settled_ok": settled_ok,
        "settled_skip": settled_skip,
        "payouts": payouts_total,
        "dunning_paused": paused_n,
        "dunning_resumed": resumed_n,
    }
