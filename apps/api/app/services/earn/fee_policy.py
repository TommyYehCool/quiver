"""Tier → perf_fee_bps policy + friend cap config (F-4a).

Single source of truth for "what fee does this tier pay" + "is there a friend
slot left". Imported by /api/earn/connect (to assign a tier on first connect)
and by /api/earn/connect-preview (to disclose the rate to the user before they
paste their key).

bps = basis points (1/100th of a percent). 500 = 5.00%, 1500 = 15.00%.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.earn import EarnAccount, EarnTier
from app.models.user import User


# ─────────────────────────────────────────────────────────
# Policy constants
# ─────────────────────────────────────────────────────────

# Friends Tooling cap — first N self-service /connect calls (regardless of
# admin/manual provisioning) get the friend slot. After that, every new
# self-service connect lands on the public tier at standard fee.
FRIEND_CAP = 10

# Tier → default fee in basis points. Used at create-time for new earn_accounts.
# Existing rows keep whatever perf_fee_bps was originally set; this map only
# governs NEW connects.
TIER_DEFAULT_FEE_BPS: dict[str, int] = {
    EarnTier.NONE.value: 0,
    EarnTier.INTERNAL.value: 0,         # Tommy / admin / test
    EarnTier.FRIEND.value: 500,          # 5%
    EarnTier.PUBLIC.value: 1500,         # 15%
    EarnTier.COMMERCIAL.value: 1500,     # legacy alias for public-tier fee
}


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────


def default_fee_bps_for_tier(tier: str) -> int:
    """Look up the default perf_fee_bps for a given tier. Defaults to public
    rate if tier string is unrecognised (defensive: never accidentally give
    someone 0% just because of a typo)."""
    return TIER_DEFAULT_FEE_BPS.get(tier, 1500)


def bps_to_pct(bps: int) -> Decimal:
    """Convert basis points to a Decimal percentage. 500 → 5.00."""
    return Decimal(bps) / Decimal(100)


async def count_friend_accounts(db: AsyncSession) -> int:
    """Count active (non-archived) earn_accounts whose user is friend tier.

    Used to enforce FRIEND_CAP at /connect time. Also includes accounts
    grandfathered into the friend tier from the pre-policy era.
    """
    q = await db.execute(
        select(func.count(EarnAccount.id))
        .join(User, User.id == EarnAccount.user_id)
        .where(
            EarnAccount.archived_at.is_(None),
            User.earn_tier == EarnTier.FRIEND.value,
        )
    )
    return int(q.scalar() or 0)


async def assign_tier_for_new_connect(db: AsyncSession) -> str:
    """Decide which tier a fresh self-service connector should land on.

    Returns EarnTier.FRIEND.value if there's a slot left, else EarnTier.PUBLIC.value.
    Caller is responsible for actually setting user.earn_tier and
    earn_account.perf_fee_bps based on this return value.
    """
    friend_count = await count_friend_accounts(db)
    if friend_count < FRIEND_CAP:
        return EarnTier.FRIEND.value
    return EarnTier.PUBLIC.value
