"""Referral DB repository helpers — shared CRUD across codes/binding/payout."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.referral import Referral, ReferralCode, ReferralPayout


# ─────────────────────────────────────────────────────────
# ReferralCode
# ─────────────────────────────────────────────────────────


async def get_code_by_user(
    db: AsyncSession, user_id: int
) -> ReferralCode | None:
    q = await db.execute(
        select(ReferralCode).where(ReferralCode.user_id == user_id)
    )
    return q.scalar_one_or_none()


async def get_code_owner(
    db: AsyncSession, normalized_code: str
) -> ReferralCode | None:
    """Returns the ReferralCode row whose code matches (caller should normalize
    first). Used during paste-binding to resolve referrer_user_id."""
    q = await db.execute(
        select(ReferralCode).where(ReferralCode.code == normalized_code)
    )
    return q.scalar_one_or_none()


# ─────────────────────────────────────────────────────────
# Referral
# ─────────────────────────────────────────────────────────


async def get_referral_by_referee(
    db: AsyncSession, referee_user_id: int
) -> Referral | None:
    q = await db.execute(
        select(Referral).where(Referral.referee_user_id == referee_user_id)
    )
    return q.scalar_one_or_none()


async def list_direct_referees(
    db: AsyncSession, referrer_user_id: int
) -> list[Referral]:
    q = await db.execute(
        select(Referral).where(
            Referral.referrer_user_id == referrer_user_id
        ).order_by(desc(Referral.bound_at))
    )
    return list(q.scalars().all())


async def count_direct_referees(
    db: AsyncSession, referrer_user_id: int
) -> int:
    q = await db.execute(
        select(func.count(Referral.id)).where(
            Referral.referrer_user_id == referrer_user_id
        )
    )
    return int(q.scalar() or 0)


# ─────────────────────────────────────────────────────────
# ReferralPayout
# ─────────────────────────────────────────────────────────


async def list_payouts_for_user(
    db: AsyncSession, payout_user_id: int, *, limit: int = 50
) -> list[ReferralPayout]:
    """Most recent payouts a given user received (as L1 or L2)."""
    q = await db.execute(
        select(ReferralPayout)
        .where(ReferralPayout.payout_user_id == payout_user_id)
        .order_by(desc(ReferralPayout.paid_at))
        .limit(limit)
    )
    return list(q.scalars().all())


async def total_earned_for_user(
    db: AsyncSession, payout_user_id: int
) -> Decimal:
    """Sum of all referral payouts the user has received, ever."""
    q = await db.execute(
        select(func.coalesce(func.sum(ReferralPayout.amount), 0)).where(
            ReferralPayout.payout_user_id == payout_user_id
        )
    )
    return Decimal(q.scalar() or 0)


async def first_payout_for_referee(
    db: AsyncSession, referee_user_id: int
) -> ReferralPayout | None:
    """Used to detect "first ever payout for this referee" → set
    revshare_started_at on the Referral row."""
    q = await db.execute(
        select(ReferralPayout)
        .where(ReferralPayout.referee_user_id == referee_user_id)
        .order_by(ReferralPayout.id)
        .limit(1)
    )
    return q.scalar_one_or_none()
