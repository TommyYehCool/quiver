"""Earn strategy preset — risk dial per earn_account (F-5a-3.5).

Revision ID: 0018_earn_strategy_preset
Revises: 0017_earn_offer_ladder
Create Date: 2026-05-04

Adds `strategy_preset` column to earn_accounts (NOT NULL, server_default
'balanced'). Existing rows backfill to 'balanced' which preserves current
production ladder/period behaviour exactly. New users default to 'balanced'
on row insert.

Values: 'conservative' / 'balanced' / 'aggressive' (validated app-side via
EarnStrategyPreset enum, not DB CHECK — same pattern as other earn enum
columns to keep migrations cheap).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_earn_strategy_preset"
down_revision: str | None = "0017_earn_offer_ladder"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "earn_accounts",
        sa.Column(
            "strategy_preset",
            sa.String(length=16),
            nullable=False,
            server_default="balanced",
        ),
    )


def downgrade() -> None:
    op.drop_column("earn_accounts", "strategy_preset")
