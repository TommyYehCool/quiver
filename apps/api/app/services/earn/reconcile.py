"""Earn reconciliation + auto-renew (F-Phase 3 / Path A F-3e).

Two responsibilities, both run by `cron_earn_reconcile` every 5 min (F-5a-3.1):

1. **Reconciliation**: detect DB ↔ Bitfinex drift.
   - For each EarnPosition in `lent` status: if its Bitfinex offer_id is no
     longer in active offers AND no active credit references it,
     transition status → `closed_external` (loan matured / borrower returned
     funds, our position is closed).
   - Also catches the "submit_offer succeeded but DB write failed" race:
     active offer on Bitfinex but no matching position → log warning.

2. **Auto-renew**: when funds return to user's funding wallet idle, submit
   a new offer so they keep earning.
   - For each active earn_account with auto_lend_enabled:
     - If Bitfinex.funding_balance ≥ MIN_AUTO_LEND_USDT and there's no
       in-flight position pipeline (pending/onchain/idle/lent), submit a
       fresh offer at competitive rate.
     - This is the "auto-renew" — Bitfinex offers are 2-day; when they
       mature, funds idle, this cron re-submits.

Pipeline stuck detection (positions sitting > 1hr in onchain_in_flight or
pending_outbound) emits warnings for admin to investigate.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.earn import EarnAccount, EarnPosition, EarnPositionStatus
from app.services.earn import notifications as earn_notifications
from app.services.earn import repo as earn_repo
from app.services.earn.auto_lend import (
    MIN_AUTO_LEND_USDT,
    _build_ladder,
    _compute_competitive_rate,
    _submit_ladder,
)
from app.services.earn.bitfinex_adapter import BitfinexFundingAdapter, fetch_market_frr

logger = get_logger(__name__)

# Pipeline stuck threshold — positions sitting in non-terminal in-flight states
# beyond this are surfaced as warnings.
STUCK_THRESHOLD = timedelta(hours=1)

# F-5a-4.2 spike-capture threshold (mirror of api/earn.py SPIKE_APR_THRESHOLD
# and spike_detector.SPIKE_THRESHOLD_APY). Keep in sync — when a credit fills
# at this APR or higher, we fire a spike notification.
SPIKE_APR_THRESHOLD = Decimal("12")


async def reconcile_account(db: AsyncSession, account: EarnAccount) -> dict[str, Any]:
    """Run reconcile + auto-renew for one earn_account. Returns summary dict."""
    summary: dict[str, Any] = {
        "earn_account_id": account.id,
        "user_id": account.user_id,
        "lent_closed": 0,
        "renewed": 0,
        "stuck_warnings": 0,
        "errors": [],
    }

    conn = await earn_repo.get_active_bitfinex_connection(db, account.id)
    if conn is None:
        return summary

    try:
        adapter = await BitfinexFundingAdapter.from_connection(db, conn)
        bf_position = await adapter.get_funding_position()
        active_offers = await adapter.list_active_offers()
    except Exception as e:
        logger.warning(
            "earn_reconcile_bitfinex_query_failed",
            earn_account_id=account.id,
            error=str(e),
        )
        summary["errors"].append(f"bitfinex_query:{e}")
        return summary

    active_offer_ids = {o.id for o in active_offers}

    # ── F-5a-4.2 spike-capture detection ──
    # Walk active credits (filled funding loans). Any credit opened SINCE the
    # last cron run AND with APR ≥ SPIKE_APR_THRESHOLD (12%) is a spike that
    # the user wants to know about. Fire one notification per new spike credit.
    # We also need current FRR for the "vs FRR" comparison line; cheap if we
    # already have a Bitfinex query in flight, fail-soft if FRR fetch hiccups.
    now_ts = datetime.now(timezone.utc)
    last_check = account.last_credits_check_at  # backfilled to NOW() at migration
    current_frr_apr: Decimal | None = None
    spike_credits = []
    for credit in bf_position.active_credits:
        opened_at = datetime.fromtimestamp(
            credit.opened_at_ms / 1000, tz=timezone.utc
        )
        if opened_at > last_check and credit.apr_pct >= SPIKE_APR_THRESHOLD:
            spike_credits.append(credit)

    if spike_credits:
        try:
            market = await fetch_market_frr()
            current_frr_apr = market.frr_apy_pct if market is not None else None
        except Exception:  # noqa: BLE001
            current_frr_apr = None
        for credit in spike_credits:
            asyncio.create_task(
                earn_notifications.notify_spike_captured(
                    user_id=account.user_id,
                    amount=credit.amount,
                    apr_pct=credit.apr_pct,
                    period_days=credit.period_days,
                    expires_at_ms=credit.expires_at_ms,
                    expected_interest=credit.expected_interest_at_expiry,
                    current_frr_apr=current_frr_apr,
                )
            )
            logger.info(
                "earn_reconcile_spike_notified",
                earn_account_id=account.id,
                credit_id=credit.id,
                apr_pct=str(credit.apr_pct),
            )
    # Always advance the watermark so we don't re-evaluate the same credits.
    account.last_credits_check_at = now_ts

    # ── 1. state-machine transitions driven by Bitfinex live state ──
    # F-5a-3.8 split the legacy "LENT" bucket into:
    #   OFFER_PENDING — offer submitted, NOT yet matched (in active_offers)
    #   LENT          — offer matched into a credit (in active_credits)
    # Transitions to detect each cycle:
    #   OFFER_PENDING → LENT             when at least one tranche disappears
    #                                    from offers AND a matching credit exists
    #   OFFER_PENDING → CLOSED_EXTERNAL  when ALL tranches disappear with no
    #                                    matching credit (cancelled / expired
    #                                    unmatched)
    #   LENT          → CLOSED_EXTERNAL  when no credit remains (period ended,
    #                                    money returned to funding wallet)
    #
    # Bitfinex doesn't link credit→offer_id, so we use AMOUNT as a heuristic
    # proxy. This is per-user-scoped (each adapter wraps one user's API key)
    # so collisions across users are impossible. Within a single user, two
    # tranches with the same amount could in theory confuse the heuristic,
    # but in practice ladder tranches use distinct amounts.
    active_credit_amounts: set[Decimal] = {c.amount for c in bf_position.active_credits}

    def _tranche_ids(pos: EarnPosition) -> list[int]:
        if pos.bitfinex_offer_ids:
            try:
                return json.loads(pos.bitfinex_offer_ids)
            except (json.JSONDecodeError, TypeError):
                pass
        return [pos.bitfinex_offer_id] if pos.bitfinex_offer_id else []

    # 1a. OFFER_PENDING — match detection
    pending_q = await db.execute(
        select(EarnPosition).where(
            EarnPosition.earn_account_id == account.id,
            EarnPosition.status == EarnPositionStatus.OFFER_PENDING.value,
        )
    )
    for pos in pending_q.scalars().all():
        tranche_ids = _tranche_ids(pos)
        if not tranche_ids:
            continue
        still_pending = any(tid in active_offer_ids for tid in tranche_ids)
        if still_pending:
            continue  # at least one tranche is still in the offer book
        # All tranches left the book — matched or cancelled?
        if pos.amount in active_credit_amounts:
            # Borrower picked up our offer — we're now earning interest
            pos.status = EarnPositionStatus.LENT.value
            logger.info(
                "earn_reconcile_offer_matched",
                earn_account_id=account.id,
                position_id=pos.id,
                primary_offer_id=pos.bitfinex_offer_id,
                amount=str(pos.amount),
            )
        else:
            # No matching credit — offer cancelled or expired without filling
            pos.status = EarnPositionStatus.CLOSED_EXTERNAL.value
            pos.closed_at = datetime.now(timezone.utc)
            pos.closed_reason = "offer_cancelled_or_expired_unmatched"
            summary["lent_closed"] += 1
            logger.info(
                "earn_reconcile_offer_cancelled_unmatched",
                earn_account_id=account.id,
                position_id=pos.id,
                primary_offer_id=pos.bitfinex_offer_id,
            )

    # 1b. LENT — credit-period-expired detection
    lent_positions_q = await db.execute(
        select(EarnPosition).where(
            EarnPosition.earn_account_id == account.id,
            EarnPosition.status == EarnPositionStatus.LENT.value,
        )
    )
    for pos in lent_positions_q.scalars().all():
        if pos.amount in active_credit_amounts:
            continue  # still earning
        # No credit with matching amount — period ended, funds back in wallet.
        # Note: this is ALSO the path legacy LENT positions take (pre-F-5a-3.8
        # they could have been "submitted but unmatched" — for those, the
        # pre-deploy backfill should have flipped to OFFER_PENDING; if not,
        # this branch will close them when their now-stale offer drops off
        # the book, same outcome as before.)
        pos.status = EarnPositionStatus.CLOSED_EXTERNAL.value
        pos.closed_at = datetime.now(timezone.utc)
        pos.closed_reason = "credit_period_expired"
        summary["lent_closed"] += 1
        logger.info(
            "earn_reconcile_position_closed",
            earn_account_id=account.id,
            position_id=pos.id,
            tranche_count=len(_tranche_ids(pos)),
            primary_offer_id=pos.bitfinex_offer_id,
        )

    await db.commit()

    # ── 2. detect stuck positions ──
    cutoff = datetime.now(timezone.utc) - STUCK_THRESHOLD
    stuck_q = await db.execute(
        select(EarnPosition).where(
            EarnPosition.earn_account_id == account.id,
            EarnPosition.status.in_(
                [
                    EarnPositionStatus.PENDING_OUTBOUND.value,
                    EarnPositionStatus.ONCHAIN_IN_FLIGHT.value,
                    EarnPositionStatus.FUNDING_IDLE.value,
                ]
            ),
            EarnPosition.created_at < cutoff,
        )
    )
    for pos in stuck_q.scalars().all():
        logger.warning(
            "earn_reconcile_position_stuck",
            earn_account_id=account.id,
            position_id=pos.id,
            status=pos.status,
            created_at=pos.created_at.isoformat(),
            last_error=pos.last_error,
        )
        summary["stuck_warnings"] += 1

    # ── 3. auto-renew: idle funds in Bitfinex → submit fresh offer ──
    if not account.auto_lend_enabled:
        return summary
    # 用 available 不是 balance — balance 包含已 lent 出去的部分(借方還沒還的本金),
    # 那些不能再掛 offer。available 才是真正 idle 可動用的。
    if bf_position.funding_available < MIN_AUTO_LEND_USDT:
        return summary

    # Skip if there's already an active in-flight pipeline for this account —
    # we don't want to stack offers; let the original finalizer / cycle finish.
    in_flight_q = await db.execute(
        select(EarnPosition.id).where(
            EarnPosition.earn_account_id == account.id,
            EarnPosition.status.in_(
                [
                    EarnPositionStatus.PENDING_OUTBOUND.value,
                    EarnPositionStatus.ONCHAIN_IN_FLIGHT.value,
                    EarnPositionStatus.FUNDING_IDLE.value,
                ]
            ),
        ).limit(1)
    )
    if in_flight_q.scalar_one_or_none() is not None:
        return summary

    # Submit fresh offer(s) for the idle funds (use available, not balance).
    # F-5a-3.2: depth-aware base rate. F-5a-3.3: laddered tranches if amount
    # qualifies (≥ 750 USDT). F-5a-3.5: ladder shape + period table driven
    # by the user's strategy_preset.
    amount = bf_position.funding_available
    base_rate = await _compute_competitive_rate(amount)
    ladder = _build_ladder(amount, base_rate, account.strategy_preset)
    try:
        offer_ids = await _submit_ladder(adapter=adapter, ladder=ladder)
    except Exception as e:
        # Most common: Bitfinex's "available=0" right after our previous cancel
        # settles. Will retry on next cron run.
        logger.warning(
            "earn_reconcile_renew_failed",
            earn_account_id=account.id,
            amount=str(amount),
            error=str(e),
        )
        summary["errors"].append(f"renew:{e}")
        return summary

    # Record the renewal as a new earn_position. F-5a-3.8: starts as
    # OFFER_PENDING (offer submitted, not yet matched); the next reconcile
    # pass flips it to LENT once a matching credit appears. Pre-3.8 this
    # was set to LENT directly which made the dashboard say "已借出, 計息中"
    # while the offer was actually still waiting for a borrower.
    new_pos = EarnPosition(
        earn_account_id=account.id,
        status=EarnPositionStatus.OFFER_PENDING.value,
        amount=amount,
        currency="USDT-TRC20",
        bitfinex_offer_id=offer_ids[0],
        bitfinex_offer_ids=json.dumps(offer_ids),
        bitfinex_offer_submitted_at=datetime.now(timezone.utc),
        bitfinex_credited_at=datetime.now(timezone.utc),  # already at Bitfinex
    )
    db.add(new_pos)
    await db.commit()

    # F-5a-4.2: auto-renew notification (kind="renew" → 「Quiver 自動續借」 copy)
    asyncio.create_task(
        earn_notifications.notify_lent_event(
            user_id=account.user_id,
            ladder=ladder,
            offer_ids=offer_ids,
            kind="renew",
        )
    )

    summary["renewed"] += 1
    logger.info(
        "earn_reconcile_renewed",
        earn_account_id=account.id,
        amount=str(amount),
        rate_daily=str(base_rate) if base_rate else "FRR",
        tranche_count=len(offer_ids),
        new_position_id=new_pos.id,
        primary_offer_id=offer_ids[0],
    )
    return summary


async def reconcile_all_accounts(db: AsyncSession) -> list[dict[str, Any]]:
    """Run reconcile_account for every active earn_account."""
    q = await db.execute(
        select(EarnAccount).where(EarnAccount.archived_at.is_(None))
    )
    accounts = list(q.scalars().all())
    summaries = []
    for account in accounts:
        try:
            summary = await reconcile_account(db, account)
        except Exception as e:
            logger.exception(
                "earn_reconcile_account_failed",
                earn_account_id=account.id,
                error=str(e),
            )
            summary = {"earn_account_id": account.id, "fatal": str(e)}
        summaries.append(summary)
    return summaries
