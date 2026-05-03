"""USDT subscription ($9.99/mo = 0% perf fee) — F-4c.

Revision ID: 0016_subscriptions
Revises: 0015_referrals_and_perf_fee
Create Date: 2026-05-03

Schema:
  - subscriptions — one row per user (currently and historically). UNIQUE on
    user_id means a user can only have one subscription history; the row's
    status + period dates encode whether it's currently active.
  - subscription_payments — per-billing-cycle audit row, mirrors a
    SUBSCRIPTION_FEE LedgerTransaction.

The new LedgerTxType (SUBSCRIPTION_FEE) is added to the application enum
only — type column is just String(24).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_subscriptions"
down_revision: str | None = "0015_referrals_and_perf_fee"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("status", sa.String(16), nullable=False, server_default="ACTIVE"),
        # ACTIVE / PAST_DUE / EXPIRED / CANCELLED
        sa.Column("plan_code", sa.String(32), nullable=False),
        # "premium_monthly_v1" — extensible for future plan tiers
        sa.Column("monthly_usdt", sa.Numeric(10, 2), nullable=False),
        # Locked at subscribe time; future price changes don't retroactively
        # affect existing subs.
        sa.Column(
            "current_period_start",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "current_period_end", sa.DateTime(timezone=True), nullable=False
        ),
        # Renewal day = same calendar-day as subscribe day (per user request).
        # Cron runs daily; rows past current_period_end get renewed or expired.
        sa.Column(
            "cancel_at_period_end",
            sa.Boolean,
            nullable=False,
            server_default="false",
        ),
        # User clicked Cancel — sub stays ACTIVE until period_end, then EXPIRES
        # without renewal. User can re-enable before period_end.
        sa.Column(
            "past_due_since",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        # Set when first failed renewal happens. >7 days → status=EXPIRED.
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        op.f("ix_subscriptions_status"), "subscriptions", ["status"]
    )
    op.create_index(
        op.f("ix_subscriptions_current_period_end"),
        "subscriptions",
        ["current_period_end"],
    )

    op.create_table(
        "subscription_payments",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "subscription_id",
            sa.BigInteger,
            sa.ForeignKey("subscriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("amount_usdt", sa.Numeric(10, 2), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        # PAID / FAILED
        sa.Column(
            "ledger_tx_id",
            sa.BigInteger,
            sa.ForeignKey("ledger_transactions.id"),
            nullable=True,
        ),
        # Null only on FAILED rows (no ledger tx posted because we couldn't
        # debit user's wallet).
        sa.Column("failure_reason", sa.String(64), nullable=True),
        sa.Column(
            "period_covered_start",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "period_covered_end",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "billed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        op.f("ix_subscription_payments_subscription_id"),
        "subscription_payments",
        ["subscription_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_subscription_payments_subscription_id"),
        table_name="subscription_payments",
    )
    op.drop_table("subscription_payments")
    op.drop_index(
        op.f("ix_subscriptions_current_period_end"), table_name="subscriptions"
    )
    op.drop_index(
        op.f("ix_subscriptions_status"), table_name="subscriptions"
    )
    op.drop_table("subscriptions")
