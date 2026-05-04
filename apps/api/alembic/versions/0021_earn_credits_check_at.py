"""Earn spike-capture watermark column — F-5a-4.2.

Revision ID: 0021_earn_credits_check_at
Revises: 0020_telegram_binding
Create Date: 2026-05-04

Adds `last_credits_check_at` to earn_accounts. Used by reconcile to detect
which active credits (high-APR funding loans on Bitfinex) are NEW since the
last cron run and worth notifying about. Without this watermark, we'd
either re-spam every credit on every cron run or miss new ones entirely.

Backfilled to NOW() on existing rows so accounts with already-active high-APR
credits don't suddenly notify a backlog at deploy time.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_earn_credits_check_at"
down_revision: str | None = "0020_telegram_binding"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "earn_accounts",
        sa.Column(
            "last_credits_check_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_column("earn_accounts", "last_credits_check_at")
