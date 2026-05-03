"""Subscription DB CRUD helpers — shared across billing + API layer."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import (
    Subscription,
    SubscriptionPayment,
    SubscriptionStatus,
)


async def get_by_user(
    db: AsyncSession, user_id: int
) -> Subscription | None:
    q = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    return q.scalar_one_or_none()


async def is_user_premium(db: AsyncSession, user_id: int) -> bool:
    """True if user has subscription with grants-benefits status (ACTIVE or
    PAST_DUE) AND current period is not yet over.

    Used by perf_fee accrual to decide whether to skip the period entirely.
    """
    sub = await get_by_user(db, user_id)
    if sub is None:
        return False
    return sub.is_currently_active


async def list_due_for_renewal(
    db: AsyncSession, *, now: datetime | None = None
) -> list[Subscription]:
    """Subscriptions whose current_period_end <= now.

    Includes:
      - ACTIVE rows whose period_end has passed (need renewal or expiry)
      - PAST_DUE rows still inside grace (retry charge)

    Excludes EXPIRED / CANCELLED — those are terminal until user re-subscribes.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    q = await db.execute(
        select(Subscription).where(
            Subscription.status.in_(
                [
                    SubscriptionStatus.ACTIVE.value,
                    SubscriptionStatus.PAST_DUE.value,
                ]
            ),
            Subscription.current_period_end <= now,
        )
    )
    return list(q.scalars().all())


async def list_payments_for_user(
    db: AsyncSession, user_id: int, *, limit: int = 50
) -> list[SubscriptionPayment]:
    q = await db.execute(
        select(SubscriptionPayment)
        .where(SubscriptionPayment.user_id == user_id)
        .order_by(desc(SubscriptionPayment.billed_at))
        .limit(limit)
    )
    return list(q.scalars().all())
