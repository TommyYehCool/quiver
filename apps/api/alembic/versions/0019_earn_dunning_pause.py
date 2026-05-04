"""Earn dunning pause flag — F-5b-2.

Revision ID: 0019_earn_dunning_pause
Revises: 0018_earn_strategy_preset
Create Date: 2026-05-04

Adds `dunning_pause_active` boolean to earn_accounts. perf_fee.settle_outstanding
uses this to track which accounts had auto-lend paused due to ≥4 consecutive
unpaid weekly accruals (so the cron knows to auto-resume when balance covers
the arrears, vs. respecting a user-initiated toggle off).

Backfilled to false for all existing rows — no current account is in dunning
state since this feature didn't exist before.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019_earn_dunning_pause"
down_revision: str | None = "0018_earn_strategy_preset"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "earn_accounts",
        sa.Column(
            "dunning_pause_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("earn_accounts", "dunning_pause_active")
