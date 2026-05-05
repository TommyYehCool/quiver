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


async def list_referees_with_progress(
    db: AsyncSession, referrer_user_id: int
) -> list[dict]:
    """F-5b-X — per-invitee progress overview for the inviter's UI.

    For each user this referrer has invited, returns:
      - invitee_user_id (internal)
      - email (caller masks before exposing)
      - earn_tier
      - invited_at
      - revshare_started_at / revshare_expires_at (from Referral row)
      - last_event_name (most-recent funnel event, chronologically)
      - commission_l1_usdt (sum of L1 payouts THIS referrer received
        from THIS invitee — not total received, not L2)

    No ORM relationships (we don't have Referral.referee → User wired)
    so 4 lightweight queries instead of one heavy join. Acceptable since
    a single user typically has dozens of referees, not thousands.
    """
    from app.models.user import User
    from app.models.funnel_event import FunnelEvent

    # 1. all referrals for this referrer, newest first
    referrals_q = await db.execute(
        select(Referral)
        .where(Referral.referrer_user_id == referrer_user_id)
        .order_by(desc(Referral.bound_at))
    )
    referrals = list(referrals_q.scalars().all())
    if not referrals:
        return []

    referee_ids = [r.referee_user_id for r in referrals]

    # 2. user rows for email + tier
    users_q = await db.execute(
        select(User.id, User.email, User.earn_tier).where(User.id.in_(referee_ids))
    )
    users_by_id = {row.id: row for row in users_q.all()}

    # 3. most-recent funnel event per user (chronologically). Uses
    # PostgreSQL DISTINCT ON. Same pattern as /admin/funnel uses;
    # picks the latest event regardless of stage ordering — funnel
    # events are append-only so latest = most-advanced in practice.
    from sqlalchemy import text

    last_event_q = await db.execute(
        text(
            """
            SELECT DISTINCT ON (user_id) user_id, event_name
            FROM funnel_events
            WHERE user_id = ANY(:user_ids)
            ORDER BY user_id, created_at DESC
            """
        ),
        {"user_ids": referee_ids},
    )
    last_event_by_user: dict[int, str] = {
        row.user_id: row.event_name for row in last_event_q.all()
    }

    # 4. L1 commission accrued from each invitee. payout_user_id is the
    # *recipient* (the inviter), referee_user_id identifies which invitee
    # generated the payout. Filter level=1 to exclude L2 grand-children
    # which would inflate per-direct-invitee numbers.
    payouts_q = await db.execute(
        select(
            ReferralPayout.referee_user_id,
            func.coalesce(func.sum(ReferralPayout.amount), 0).label("total"),
        )
        .where(
            ReferralPayout.payout_user_id == referrer_user_id,
            ReferralPayout.referee_user_id.in_(referee_ids),
            ReferralPayout.level == 1,
        )
        .group_by(ReferralPayout.referee_user_id)
    )
    commission_by_referee: dict[int, Decimal] = {
        row.referee_user_id: Decimal(row.total) for row in payouts_q.all()
    }

    # Assemble
    out = []
    for r in referrals:
        u = users_by_id.get(r.referee_user_id)
        out.append(
            {
                "invitee_user_id": r.referee_user_id,
                "email": u.email if u else "",
                "earn_tier": u.earn_tier if u else None,
                "invited_at": r.bound_at,
                "last_event_name": last_event_by_user.get(r.referee_user_id),
                "revshare_started_at": r.revshare_started_at,
                "revshare_expires_at": r.revshare_expires_at,
                "commission_l1_usdt": commission_by_referee.get(
                    r.referee_user_id, Decimal(0)
                ),
            }
        )
    return out
