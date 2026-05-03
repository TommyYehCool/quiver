"""Pydantic schemas for /api/subscription/* (F-4c)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class SubscriptionStateOut(BaseModel):
    """Current subscription state for the user. null = never subscribed."""
    status: str  # ACTIVE / PAST_DUE / EXPIRED / CANCELLED
    plan_code: str
    monthly_usdt: Decimal
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool
    is_currently_active: bool  # ACTIVE/PAST_DUE within current period
    past_due_since: datetime | None


class SubscriptionMeOut(BaseModel):
    """Snapshot for /subscription page."""
    subscription: SubscriptionStateOut | None
    # Plan info (for the subscribe CTA when no subscription exists yet).
    plan_price_usdt: Decimal
    plan_period_days: int
    grace_days: int


class SubscribeOut(BaseModel):
    subscription: SubscriptionStateOut


class PaymentOut(BaseModel):
    id: int
    amount_usdt: Decimal
    status: str  # PAID / FAILED
    failure_reason: str | None
    period_covered_start: datetime
    period_covered_end: datetime
    billed_at: datetime


class PaymentsOut(BaseModel):
    items: list[PaymentOut]
