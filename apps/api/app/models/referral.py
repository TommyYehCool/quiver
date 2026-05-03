"""Referral system models — F-4b.

Three tables:
  - referral_codes  — one user-chosen code per user (uppercase normalized)
  - referrals       — referee → referrer binding (one referrer per user, ever)
  - referral_payouts — audit trail of L1/L2 revshare payouts on perf_fee events

The L1/L2 distinction is computed at payout time by walking the referrer chain
upward from the perf_fee-paying user. We deliberately don't denormalize "level"
into referrals (e.g., "this user is L2 of so-and-so") because chains rebind on
admin override.
"""

from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class ReferralBindingSource(str, enum.Enum):
    """referrals.binding_source — how the user got bound to a referrer."""

    EARN_CONNECT = "earn_connect"        # Pasted code in /earn/connect form
    SETTINGS_PASTE = "settings_paste"    # Pasted later in /referral page
    ADMIN_OVERRIDE = "admin_override"    # Admin manually rebound (rare)


# ─────────────────────────────────────────────────────────
# ReferralCode
# ─────────────────────────────────────────────────────────


class ReferralCode(Base):
    """One self-chosen alphanumeric code per user. Uppercase normalized.

    Constraints (enforced at app layer):
      - 4-12 chars, [A-Z0-9]+
      - Reserved words blocked (admin, root, support, quiver, etc.)
      - Once set, only admin can rotate (no user-facing PATCH)
    """

    __tablename__ = "referral_codes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# ─────────────────────────────────────────────────────────
# Referral
# ─────────────────────────────────────────────────────────


class Referral(Base):
    """A referee → referrer binding. One row per user (ever).

    revshare_started_at / revshare_expires_at are populated when the referee's
    first perf_fee accrual is collected; before that they're null.

    Cycle prevention: at bind time we walk the chain upward from referrer and
    reject if we ever hit referee (the bind-rejecting check lives in
    `services/referral/binding.py`).
    """

    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    referee_user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    referrer_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False, index=True
    )

    bound_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    binding_source: Mapped[str] = mapped_column(String(20), nullable=False)
    # ReferralBindingSource value

    revshare_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    revshare_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )


# ─────────────────────────────────────────────────────────
# ReferralPayout
# ─────────────────────────────────────────────────────────


class ReferralPayout(Base):
    """Audit row for one L1 or L2 revshare payout event.

    Twin of a REFERRAL_PAYOUT LedgerTransaction; payout_user_id's wallet was
    credited (CR) by `amount` USDT, debited from PLATFORM_FEE_REVENUE.

    The unique constraint on (earn_fee_accrual_id, payout_user_id, level)
    guards against double-paying when the settlement cron is retried.
    """

    __tablename__ = "referral_payouts"
    __table_args__ = (
        UniqueConstraint(
            "earn_fee_accrual_id",
            "payout_user_id",
            "level",
            name="uq_referral_payouts_accrual_payee_level",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    referee_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False, index=True
    )
    # Whose perf_fee triggered this payout
    payout_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False, index=True
    )
    # Who got paid (referrer at L1 or L2 of referee_user_id)
    earn_fee_accrual_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("earn_fee_accruals.id"), nullable=False
    )
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # 1 = direct referrer, 2 = grandparent referrer
    amount: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    ledger_tx_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ledger_transactions.id"), nullable=False
    )

    paid_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
