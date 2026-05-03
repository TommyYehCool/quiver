"""Compute & apply L1/L2 revshare payouts on perf_fee events (F-4b).

Called from `services/earn/perf_fee.settle_outstanding()` immediately after a
successful EARN_PERF_FEE ledger transaction is posted. Walks up to 2 levels of
the referrer chain, computes payout amounts (L1=10%, L2=5% of perf_fee), checks
the 6-month window, and credits each ancestor's main wallet via REFERRAL_PAYOUT
ledger transactions.

Sets `revshare_started_at` / `revshare_expires_at` on the referee's Referral
row the FIRST time we ever pay out for them.

Idempotency: relies on the (earn_fee_accrual_id, payout_user_id, level)
unique constraint on referral_payouts to reject duplicates.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.referral import ReferralPayout
from app.services import ledger as ledger_service
from app.services.referral import binding, policy, repo

logger = get_logger(__name__)


def _payout_amount(perf_fee_amount: Decimal, revshare_bps: int) -> Decimal:
    """perf_fee × bps/10000, rounded to 18 decimals."""
    raw = perf_fee_amount * Decimal(revshare_bps) / Decimal(10000)
    return raw.quantize(Decimal("0.000000000000000001"))


async def compute_and_apply_payouts(
    db: AsyncSession,
    *,
    referee_user_id: int,
    earn_fee_accrual_id: int,
    perf_fee_amount: Decimal,
) -> int:
    """For one settled perf_fee accrual, pay L1 + L2 referrers (if any, if in
    window). Returns count of payouts actually applied (0 / 1 / 2).

    Caller must `await db.commit()` after this returns to persist both the
    referral_payouts rows and the wallet credits.
    """
    # Walk chain up to 2 levels
    chain = await binding.get_chain(db, referee_user_id, max_depth=2)
    if not chain:
        return 0

    # Window check — if invitee already has a Referral row with
    # revshare_expires_at set, we're past the 6-month window once that's elapsed.
    # If revshare_started_at is NULL (this is the first payout), we'll set both
    # below.
    referral_row = await repo.get_referral_by_referee(db, referee_user_id)
    if referral_row is None:
        # User has direct ancestors via chain walk but no Referral row —
        # shouldn't happen, but defensive.
        logger.warning(
            "referral_payout_no_referral_row_but_chain_exists",
            referee=referee_user_id,
            chain=chain,
        )
        return 0

    now = datetime.now(timezone.utc)
    if referral_row.revshare_expires_at is not None and now > referral_row.revshare_expires_at:
        logger.info(
            "referral_payout_window_expired",
            referee=referee_user_id,
            expired_at=str(referral_row.revshare_expires_at),
        )
        return 0

    # First-ever payout for this referee → start the 6-month clock
    if referral_row.revshare_started_at is None:
        referral_row.revshare_started_at = now
        referral_row.revshare_expires_at = now + timedelta(
            days=policy.REVSHARE_WINDOW_DAYS
        )

    levels_bps = [
        (1, policy.L1_REVSHARE_BPS),
        (2, policy.L2_REVSHARE_BPS),
    ]
    payouts_made = 0

    for (level, bps), payout_user_id in zip(levels_bps, chain):
        amount = _payout_amount(perf_fee_amount, bps)
        if amount < policy.MIN_PAYOUT_USDT:
            logger.info(
                "referral_payout_below_threshold",
                referee=referee_user_id,
                level=level,
                amount=str(amount),
                min=str(policy.MIN_PAYOUT_USDT),
            )
            continue

        # Post REFERRAL_PAYOUT ledger transaction (DR PLATFORM_FEE_REVENUE,
        # CR USER(payout_user_id))
        ledger_tx = await ledger_service.post_referral_payout(
            db, referrer_user_id=payout_user_id, amount=amount
        )

        # Audit row (idempotency guard via unique constraint)
        audit = ReferralPayout(
            referee_user_id=referee_user_id,
            payout_user_id=payout_user_id,
            earn_fee_accrual_id=earn_fee_accrual_id,
            level=level,
            amount=amount,
            ledger_tx_id=ledger_tx.id,
        )
        db.add(audit)
        try:
            await db.flush()
        except IntegrityError:
            # Already paid out for this (accrual, payee, level) — race or retry.
            # Roll back this audit row but don't error out; settlement loop
            # continues with next level.
            await db.rollback()
            logger.warning(
                "referral_payout_idempotency_conflict",
                referee=referee_user_id,
                payout_user=payout_user_id,
                accrual_id=earn_fee_accrual_id,
                level=level,
            )
            # NOTE: rolling back kills the ledger_tx too. That's correct —
            # the prior commit already created the canonical ledger entry
            # for this combination, and we don't want a duplicate.
            continue

        payouts_made += 1
        logger.info(
            "referral_payout_applied",
            referee=referee_user_id,
            payout_user=payout_user_id,
            accrual_id=earn_fee_accrual_id,
            level=level,
            amount=str(amount),
        )

    return payouts_made
