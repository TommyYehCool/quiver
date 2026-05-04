"""Subscription billing operations — F-4c.

Public APIs:
  - subscribe(user_id) — debit immediately, create/replace subscription row
  - cancel(user_id) — flip cancel_at_period_end=true (no immediate effect)
  - uncancel(user_id) — flip back to false (resume auto-renewal)
  - renew_due_subscriptions() — daily cron entrypoint

Renewal logic:
  - If sub.cancel_at_period_end → mark CANCELLED (no charge attempt)
  - Else try to debit monthly_usdt:
      - Success: advance period_start/end + create PAID payment row + clear past_due
      - Insufficient balance: mark PAST_DUE if not already, set past_due_since,
        log warning. Don't advance period — retry tomorrow.
      - PAST_DUE for > PAST_DUE_GRACE_DAYS: mark EXPIRED (benefits stop).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.subscription import (
    PLAN_PREMIUM_MONTHLY_V1,
    Subscription,
    SubscriptionFailureReason,
    SubscriptionPayment,
    SubscriptionPaymentStatus,
    SubscriptionStatus,
)
from app.services import ledger as ledger_service
from app.services.premium import policy, repo

logger = get_logger(__name__)


class SubscriptionError(Exception):
    """Raised when an operation fails. .code holds an i18n key."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


# ─────────────────────────────────────────────────────────
# subscribe
# ─────────────────────────────────────────────────────────


async def subscribe(db: AsyncSession, *, user_id: int) -> Subscription:
    """Subscribe a user to Premium. Charges immediately, fails if insufficient
    balance. If user has an existing EXPIRED/CANCELLED row, that row is
    overwritten in place (we don't accumulate history rows; payment history
    lives in subscription_payments).

    Caller responsible for `await db.commit()` after success.
    Raises SubscriptionError on:
      - "subscription.alreadyActive" — sub exists with grants-benefits status
      - "subscription.insufficientBalance"
    """
    existing = await repo.get_by_user(db, user_id)
    if existing is not None and existing.is_currently_active:
        raise SubscriptionError("subscription.alreadyActive")

    # Charge immediately
    balance = await ledger_service.get_user_balance(db, user_id)
    if balance < policy.PREMIUM_MONTHLY_PRICE_USDT:
        raise SubscriptionError("subscription.insufficientBalance")

    ledger_tx = await ledger_service.post_subscription_fee(
        db, user_id=user_id, amount=policy.PREMIUM_MONTHLY_PRICE_USDT
    )

    now = datetime.now(timezone.utc)
    period_end = now + timedelta(days=policy.PERIOD_DAYS)

    if existing is None:
        sub = Subscription(
            user_id=user_id,
            status=SubscriptionStatus.ACTIVE.value,
            plan_code=PLAN_PREMIUM_MONTHLY_V1,
            monthly_usdt=policy.PREMIUM_MONTHLY_PRICE_USDT,
            current_period_start=now,
            current_period_end=period_end,
            cancel_at_period_end=False,
            past_due_since=None,
        )
        db.add(sub)
        await db.flush()
    else:
        # Overwrite EXPIRED/CANCELLED row in place
        existing.status = SubscriptionStatus.ACTIVE.value
        existing.plan_code = PLAN_PREMIUM_MONTHLY_V1
        existing.monthly_usdt = policy.PREMIUM_MONTHLY_PRICE_USDT
        existing.current_period_start = now
        existing.current_period_end = period_end
        existing.cancel_at_period_end = False
        existing.past_due_since = None
        sub = existing

    payment = SubscriptionPayment(
        subscription_id=sub.id,
        user_id=user_id,
        amount_usdt=policy.PREMIUM_MONTHLY_PRICE_USDT,
        status=SubscriptionPaymentStatus.PAID.value,
        ledger_tx_id=ledger_tx.id,
        period_covered_start=now,
        period_covered_end=period_end,
    )
    db.add(payment)
    await db.flush()

    logger.info(
        "subscription_started",
        user_id=user_id,
        sub_id=sub.id,
        amount=str(policy.PREMIUM_MONTHLY_PRICE_USDT),
        period_end=str(period_end),
    )
    return sub


# ─────────────────────────────────────────────────────────
# cancel / uncancel
# ─────────────────────────────────────────────────────────


async def cancel(db: AsyncSession, *, user_id: int) -> Subscription:
    """Schedule cancellation at current_period_end. Sub keeps granting benefits
    until then. User can call uncancel() before period_end to undo.
    """
    sub = await repo.get_by_user(db, user_id)
    if sub is None or not sub.is_currently_active:
        raise SubscriptionError("subscription.notActive")
    sub.cancel_at_period_end = True
    logger.info("subscription_cancel_scheduled", user_id=user_id, sub_id=sub.id)
    return sub


async def uncancel(db: AsyncSession, *, user_id: int) -> Subscription:
    """Undo a pending cancellation. Only works while still in current period."""
    sub = await repo.get_by_user(db, user_id)
    if sub is None or not sub.is_currently_active:
        raise SubscriptionError("subscription.notActive")
    if not sub.cancel_at_period_end:
        raise SubscriptionError("subscription.notCancelled")
    sub.cancel_at_period_end = False
    logger.info("subscription_uncancelled", user_id=user_id, sub_id=sub.id)
    return sub


# ─────────────────────────────────────────────────────────
# Daily renewal cron entrypoint
# ─────────────────────────────────────────────────────────


async def renew_due_subscriptions(db: AsyncSession) -> dict[str, int]:
    """For each subscription past current_period_end:
      - cancel_at_period_end=true → mark CANCELLED
      - else try to charge:
          success → advance period
          fail (insufficient balance) → first time: PAST_DUE; ongoing: leave PAST_DUE
              if past_due_since > GRACE → EXPIRED

    Returns counts for telemetry.
    """
    now = datetime.now(timezone.utc)
    due = await repo.list_due_for_renewal(db, now=now)

    counts = {
        "due": len(due),
        "renewed": 0,
        "cancelled": 0,
        "past_due": 0,
        "expired": 0,
    }

    for sub in due:
        # Case 1: scheduled cancellation
        if sub.cancel_at_period_end:
            sub.status = SubscriptionStatus.CANCELLED.value
            counts["cancelled"] += 1
            logger.info(
                "subscription_cancelled_at_period_end",
                user_id=sub.user_id,
                sub_id=sub.id,
            )
            continue

        # Case 2: PAST_DUE for too long → expire
        if (
            sub.status == SubscriptionStatus.PAST_DUE.value
            and sub.past_due_since is not None
        ):
            grace_deadline = sub.past_due_since + timedelta(
                days=policy.PAST_DUE_GRACE_DAYS
            )
            if now > grace_deadline:
                sub.status = SubscriptionStatus.EXPIRED.value
                counts["expired"] += 1
                logger.info(
                    "subscription_expired_after_grace",
                    user_id=sub.user_id,
                    sub_id=sub.id,
                    past_due_since=str(sub.past_due_since),
                )
                continue

        # Case 3: try to charge
        balance = await ledger_service.get_user_balance(db, sub.user_id)
        if balance < sub.monthly_usdt:
            # Insufficient — go/stay PAST_DUE
            transitioning_to_past_due = (
                sub.status != SubscriptionStatus.PAST_DUE.value
            )
            if transitioning_to_past_due:
                sub.status = SubscriptionStatus.PAST_DUE.value
                sub.past_due_since = now
            # Audit row for the failed attempt
            db.add(
                SubscriptionPayment(
                    subscription_id=sub.id,
                    user_id=sub.user_id,
                    amount_usdt=sub.monthly_usdt,
                    status=SubscriptionPaymentStatus.FAILED.value,
                    ledger_tx_id=None,
                    failure_reason=SubscriptionFailureReason.INSUFFICIENT_BALANCE.value,
                    period_covered_start=sub.current_period_start,
                    period_covered_end=sub.current_period_end,
                )
            )
            counts["past_due"] += 1
            logger.warning(
                "subscription_renewal_insufficient",
                user_id=sub.user_id,
                sub_id=sub.id,
                need=str(sub.monthly_usdt),
                balance=str(balance),
            )
            # F-5b-5: TG ping the FIRST time we transition into PAST_DUE.
            # Subsequent weeks during the grace window stay quiet (the user
            # already knows). track_once gives us per-user idempotency.
            if transitioning_to_past_due:
                import asyncio
                from app.services import funnel
                from app.services.earn import notifications as earn_notifications

                already_sent = not await funnel.track_once(
                    db,
                    sub.user_id,
                    funnel.TG_NOTIFICATION_PREMIUM_PAYMENT_FAILED_SENT,
                )
                if not already_sent:
                    asyncio.create_task(
                        earn_notifications.notify_premium_payment_failed(
                            user_id=sub.user_id,
                            monthly_amount=sub.monthly_usdt,
                            wallet_balance=balance,
                            grace_days=policy.PAST_DUE_GRACE_DAYS,
                        )
                    )
            continue

        # Charge succeeds — debit + advance period
        ledger_tx = await ledger_service.post_subscription_fee(
            db, user_id=sub.user_id, amount=sub.monthly_usdt
        )
        new_start = sub.current_period_end
        new_end = new_start + timedelta(days=policy.PERIOD_DAYS)
        db.add(
            SubscriptionPayment(
                subscription_id=sub.id,
                user_id=sub.user_id,
                amount_usdt=sub.monthly_usdt,
                status=SubscriptionPaymentStatus.PAID.value,
                ledger_tx_id=ledger_tx.id,
                period_covered_start=new_start,
                period_covered_end=new_end,
            )
        )
        sub.current_period_start = new_start
        sub.current_period_end = new_end
        sub.status = SubscriptionStatus.ACTIVE.value
        sub.past_due_since = None
        counts["renewed"] += 1
        logger.info(
            "subscription_renewed",
            user_id=sub.user_id,
            sub_id=sub.id,
            amount=str(sub.monthly_usdt),
            new_period_end=str(new_end),
        )

    await db.commit()
    return counts
