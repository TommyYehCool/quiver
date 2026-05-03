"""Earn Path A pipeline — auto-lend toggle + cached deposit address + positions table.

Revision ID: 0014_earn_path_a_pipeline
Revises: 0013_earn_friends_tooling
Create Date: 2026-05-03

F-Phase 3 / Path A MVP D1 (foundation):
  - earn_accounts.auto_lend_enabled (bool, default true) — toggle B from product spec
  - earn_accounts.bitfinex_funding_address (text) — cached from Bitfinex API
  - earn_positions table — per-deposit pipeline state machine

設計理念見 docs/EARN-PATH-A-MVP-PLAN.md。
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_earn_path_a_pipeline"
down_revision: str | None = "0013_earn_friends_tooling"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ─────────────────────────────────────────────────────────
    # 1. earn_accounts: 兩個新 column
    # ─────────────────────────────────────────────────────────
    op.add_column(
        "earn_accounts",
        sa.Column(
            "auto_lend_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    # Toggle B:default on,user 可關。Off 不影響已 lent 部位自然到期。

    op.add_column(
        "earn_accounts",
        sa.Column("bitfinex_funding_address", sa.String(64), nullable=True),
    )
    # Cache 從 Bitfinex /v2/auth/w/deposit/address (wallet=funding,
    # method=tetherusx) 拿到的 user TRC20 USDT 入金地址。
    # 第一次 connect 時 fetch + 存,之後 broadcast 前可 refresh。

    # ─────────────────────────────────────────────────────────
    # 2. earn_positions table — Path A pipeline state machine
    # ─────────────────────────────────────────────────────────
    op.create_table(
        "earn_positions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("earn_account_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.String(24),
            nullable=False,
            server_default="pending_outbound",
        ),
        # EarnPositionStatus enum:
        #   pending_outbound | onchain_in_flight | funding_idle | lent
        #   | closing | closed_external | failed
        sa.Column("amount", sa.Numeric(38, 6), nullable=False),
        sa.Column(
            "currency",
            sa.String(16),
            nullable=False,
            server_default="USDT-TRC20",
        ),
        # onchain (HOT → user.bitfinex_funding_address)
        sa.Column("onchain_tx_hash", sa.String(128), nullable=True),
        sa.Column(
            "onchain_broadcast_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            "bitfinex_credited_at", sa.DateTime(timezone=True), nullable=True
        ),
        # Bitfinex
        sa.Column("bitfinex_offer_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "bitfinex_offer_submitted_at", sa.DateTime(timezone=True), nullable=True
        ),
        # closing
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_reason", sa.String(64), nullable=True),
        # diagnostics
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "retry_count",
            sa.SmallInteger(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["earn_account_id"], ["earn_accounts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_earn_positions"),
    )
    op.create_index(
        "ix_earn_positions_earn_account_id",
        "earn_positions",
        ["earn_account_id"],
    )
    op.create_index(
        "ix_earn_positions_onchain_tx_hash",
        "earn_positions",
        ["onchain_tx_hash"],
    )
    op.create_index(
        "ix_earn_positions_bitfinex_offer_id",
        "earn_positions",
        ["bitfinex_offer_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_earn_positions_bitfinex_offer_id", table_name="earn_positions")
    op.drop_index("ix_earn_positions_onchain_tx_hash", table_name="earn_positions")
    op.drop_index("ix_earn_positions_earn_account_id", table_name="earn_positions")
    op.drop_table("earn_positions")
    op.drop_column("earn_accounts", "bitfinex_funding_address")
    op.drop_column("earn_accounts", "auto_lend_enabled")
