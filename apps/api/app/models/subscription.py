"""Subscription models — F-4c.

Two tables:
  - subscriptions       — one row per user (lifecycle: ACTIVE → PAST_DUE → EXPIRED
                          or ACTIVE → CANCELLED). Status + period_end together
                          encode "is currently subscribed".
  - subscription_payments — per-billing-cycle audit row, twin of a
                          SUBSCRIPTION_FEE LedgerTransaction.

The "is user currently premium" check (used by perf_fee accrual to skip the
fee for subscribed users) is just `subscriptions.status IN (ACTIVE, PAST_DUE)
AND current_period_end > now`.
"""

from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class SubscriptionStatus(str, enum.Enum):
    """subscriptions.status — lifecycle states."""

    ACTIVE = "ACTIVE"
    # In current paid period. Will auto-renew at current_period_end unless
    # cancel_at_period_end=true.
    PAST_DUE = "PAST_DUE"
    # Renewal failed (insufficient balance). Sub still grants 0% perf fee
    # during a 7-day grace, then auto-EXPIRES.
    EXPIRED = "EXPIRED"
    # Past period_end, never renewed. User can subscribe again (overwrites
    # the row).
    CANCELLED = "CANCELLED"
    # User cancelled AND period_end has passed. Same effect as EXPIRED;
    # separate state purely for analytics ("did they leave voluntarily?").


class SubscriptionPaymentStatus(str, enum.Enum):
    """subscription_payments.status."""

    PAID = "PAID"
    FAILED = "FAILED"


class SubscriptionFailureReason(str, enum.Enum):
    """subscription_payments.failure_reason — why a renewal attempt failed."""

    INSUFFICIENT_BALANCE = "insufficient_balance"
    UNKNOWN_ERROR = "unknown_error"


# Plan code constants (for now there's just one)
PLAN_PREMIUM_MONTHLY_V1 = "premium_monthly_v1"


# ─────────────────────────────────────────────────────────
# Subscription
# ─────────────────────────────────────────────────────────


class Subscription(Base):
    """One row per user (UNIQUE on user_id). Lifecycle states + period dates
    encode whether the subscription is currently active.

    To resubscribe after EXPIRED/CANCELLED, the existing row is updated in-place
    (status flips to ACTIVE, new period_start/period_end). Avoids accumulating
    historical rows; payment history lives in subscription_payments.
    """

    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=SubscriptionStatus.ACTIVE.value
    )
    plan_code: Mapped[str] = mapped_column(String(32), nullable=False)
    monthly_usdt: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    current_period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    current_period_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    past_due_since: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    @property
    def is_currently_active(self) -> bool:
        """True if user gets premium benefits right now.

        ACTIVE / PAST_DUE both grant the 0% perf fee — PAST_DUE is the 7-day
        grace window where we keep trying to charge but don't penalize.
        EXPIRED / CANCELLED don't.
        """
        from datetime import datetime, timezone
        if self.status not in (
            SubscriptionStatus.ACTIVE.value,
            SubscriptionStatus.PAST_DUE.value,
        ):
            return False
        return self.current_period_end > datetime.now(timezone.utc)


# ─────────────────────────────────────────────────────────
# SubscriptionPayment
# ─────────────────────────────────────────────────────────


class SubscriptionPayment(Base):
    """Audit row for one billing cycle. PAID rows have a ledger_tx_id; FAILED
    rows have a failure_reason. Used to power the user-facing payment history."""

    __tablename__ = "subscription_payments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    subscription_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False, index=True
    )
    amount_usdt: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    ledger_tx_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ledger_transactions.id"), nullable=True
    )
    failure_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)

    period_covered_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    period_covered_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    billed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
