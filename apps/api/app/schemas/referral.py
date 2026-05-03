"""Pydantic schemas for /api/referral/* (F-4b)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────
# GET /api/referral/me
# ─────────────────────────────────────────────────────────


class ReferrerInfo(BaseModel):
    """Who I'm bound to as referee, if anyone."""
    referrer_user_id: int
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
