"""Pydantic schemas for /api/referral/* (F-4b)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────
# GET /api/referral/me
# ─────────────────────────────────────────────────────────


class InviteeOut(BaseModel):
    """F-5b-X — per-invitee progress row for the inviter's overview.

    Privacy: email is masked at the API boundary ("ro****@gmail.com")
    so the inviter sees a stable identifier without exposing the full
    address. Earn tier is shown so the inviter understands which
    invitees are eligible to generate revshare (Friend tier and
    Premium subscribers don't accrue performance fees → 0 commission).
    """
    invitee_user_id: int
    masked_email: str            # "ro****@gmail.com"
    earn_tier: str | None        # "public" / "friend" / "premium" / null
    invited_at: datetime
    last_event_name: str | None  # raw funnel event code; UI translates
    revshare_started_at: datetime | None
    revshare_expires_at: datetime | None
    commission_l1_usdt: Decimal  # sum of L1 payouts FROM this invitee
    is_revshare_eligible: bool   # True only when public tier (would pay perf fee)


class InviteesOut(BaseModel):
    invitees: list[InviteeOut]
    total_commission_l1_usdt: Decimal


class ReferrerInfo(BaseModel):
    """Who I'm bound to as referee, if anyone."""
    referrer_user_id: int
    # F-5b-X: include referrer's code so UI can show "你被 TOMMYYEH 推薦"
    # instead of generic "you have a referrer". Always populated when
    # the binding exists (every binding goes through a code lookup).
    referrer_code: str
    bound_at: datetime
    binding_source: str
    revshare_started_at: datetime | None  # null = no perf_fee yet
    revshare_expires_at: datetime | None


class ReferralMeOut(BaseModel):
    """Everything the user needs on /referral page."""
    # Their own code (null if not set yet)
    code: str | None
    # Reserve quota / share-link host (so frontend doesn't hardcode)
    share_url_template: str  # e.g. "https://quiverdefi.com/?ref={code}"
    # Their referrer (null if not bound)
    referrer: ReferrerInfo | None
    # Their direct invitees
    direct_referees_count: int
    # Total revshare USDT they've earned, ever
    total_earned_usdt: Decimal
    # Policy info for UI display
    l1_pct: Decimal  # e.g. 10
    l2_pct: Decimal  # e.g. 5
    window_days: int  # 180


# ─────────────────────────────────────────────────────────
# POST /api/referral/code
# ─────────────────────────────────────────────────────────


class SetCodeIn(BaseModel):
    code: str = Field(..., min_length=4, max_length=12)


class SetCodeOut(BaseModel):
    code: str


# ─────────────────────────────────────────────────────────
# POST /api/referral/bind
# ─────────────────────────────────────────────────────────


class BindIn(BaseModel):
    code: str = Field(..., min_length=4, max_length=12)


class BindOut(BaseModel):
    referrer_user_id: int
    bound_at: datetime
    binding_source: str


# ─────────────────────────────────────────────────────────
# GET /api/referral/payouts
# ─────────────────────────────────────────────────────────


class PayoutOut(BaseModel):
    id: int
    referee_user_id: int
    level: int  # 1 or 2
    amount: Decimal
    paid_at: datetime


class PayoutsOut(BaseModel):
    items: list[PayoutOut]
    total_earned: Decimal
