"""Referral system + Path A perf_fee accrual/collection plumbing — F-4b.

Revision ID: 0015_referrals_and_perf_fee
Revises: 0014_earn_path_a_pipeline
Create Date: 2026-05-03

Schema changes:
  - referral_codes — one user-chosen code per user (uppercase normalized, unique)
  - referrals — referee → referrer binding with revshare 6-month window timestamps
  - referral_payouts — ledger-backed audit trail of L1/L2 revshare payouts
  - Seed PLATFORM_FEE_REVENUE account for perf_fee collection (offsets DR USER on
    EARN_PERF_FEE ledger transactions)

The two new LedgerTxType values (EARN_PERF_FEE, REFERRAL_PAYOUT) are added to
the application enum but NOT to a DB constraint — type column is just String(24).
Same for PLATFORM_FEE_REVENUE on AccountKind.

設計理念見 docs/EARN-F4B-PERF-FEE-AND-REFERRAL.md(待補)。
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_referrals_and_perf_fee"
down_revision: str | None = "0014_earn_path_a_pipeline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ─────────────────────────────────────────────────────────
    # 1. referral_codes — one self-chosen code per user
    # ─────────────────────────────────────────────────────────
    op.create_table(
        "referral_codes",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("code", sa.String(20), nullable=False, unique=True),
        # Normalized uppercase, [A-Z0-9]+, 4-12 chars enforced at app layer.
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
        op.f("ix_referral_codes_code"), "referral_codes", ["code"], unique=False
    )

    # ─────────────────────────────────────────────────────────
    # 2. referrals — one binding per referee (cycle-protected at app layer)
    # ─────────────────────────────────────────────────────────
    op.create_table(
        "referrals",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "referee_user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        # Direct (L1) referrer. L2 = referrer's referrer, computed at payout time
        # by walking the chain — not stored here, so we don't have to re-derive on
        # the rare admin override of an upstream binding.
        sa.Column(
            "referrer_user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "bound_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("binding_source", sa.String(20), nullable=False),
        # "earn_connect" | "settings_paste" | "admin_override"
        sa.Column(
            "revshare_started_at", sa.DateTime(timezone=True), nullable=True
        ),
        # Set when referee's first perf_fee accrual is collected. Null = revshare
        # window hasn't started.
        sa.Column(
            "revshare_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
        # = revshare_started_at + 180 days (= REVSHARE_WINDOW_DAYS).
    )
    op.create_index(
        op.f("ix_referrals_referrer_user_id"),
        "referrals",
        ["referrer_user_id"],
    )

    # ─────────────────────────────────────────────────────────
    # 3. referral_payouts — audit trail per L1/L2 payout event
    # ─────────────────────────────────────────────────────────
    op.create_table(
        "referral_payouts",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "referee_user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        # The user whose perf_fee triggered this payout.
        sa.Column(
            "payout_user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        # The user who got paid (referrer at L1 or L2 of referee_user_id).
        sa.Column(
            "earn_fee_accrual_id",
            sa.BigInteger,
            sa.ForeignKey("earn_fee_accruals.id"),
            nullable=False,
        ),
        sa.Column("level", sa.SmallInteger, nullable=False),
        # 1 = direct referrer, 2 = grandparent referrer
        sa.Column("amount", sa.Numeric(38, 18), nullable=False),
        # The USDT amount credited to payout_user_id's wallet.
        sa.Column(
            "ledger_tx_id",
            sa.BigInteger,
            sa.ForeignKey("ledger_transactions.id"),
            nullable=False,
        ),
        # The REFERRAL_PAYOUT LedgerTransaction this row is the audit twin of.
        sa.Column(
            "paid_at",
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
        sa.UniqueConstraint(
            "earn_fee_accrual_id",
            "payout_user_id",
            "level",
            name="uq_referral_payouts_accrual_payee_level",
        ),
        # Idempotency guard: re-running the cron over the same accrual won't
        # double-pay.
    )
    op.create_index(
        op.f("ix_referral_payouts_payout_user_id"),
        "referral_payouts",
        ["payout_user_id"],
    )
    op.create_index(
        op.f("ix_referral_payouts_referee_user_id"),
        "referral_payouts",
        ["referee_user_id"],
    )

    # ─────────────────────────────────────────────────────────
    # 4. Seed PLATFORM_FEE_REVENUE ledger account
    # ─────────────────────────────────────────────────────────
    # Offsetting account for EARN_PERF_FEE transactions:
    #   DR USER (claim reduces by perf_fee)
    #   CR PLATFORM_FEE_REVENUE (Quiver's revenue claim grows)
    # Same currency convention as PLATFORM_CUSTODY (USDT-TRC20).
    op.execute(
        "INSERT INTO accounts (user_id, kind, currency, created_at, updated_at) "
        "VALUES (NULL, 'PLATFORM_FEE_REVENUE', 'USDT-TRC20', now(), now())"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM accounts WHERE kind = 'PLATFORM_FEE_REVENUE' "
        "AND currency = 'USDT-TRC20' AND user_id IS NULL"
    )
    op.drop_index(
        op.f("ix_referral_payouts_referee_user_id"), table_name="referral_payouts"
    )
    op.drop_index(
        op.f("ix_referral_payouts_payout_user_id"), table_name="referral_payouts"
    )
    op.drop_table("referral_payouts")
    op.drop_index(op.f("ix_referrals_referrer_user_id"), table_name="referrals")
    op.drop_table("referrals")
    op.drop_index(op.f("ix_referral_codes_code"), table_name="referral_codes")
    op.drop_table("referral_codes")
