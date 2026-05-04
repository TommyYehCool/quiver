"""Earn ladder tranches — store K offer IDs per EarnPosition (F-5a-3.3).

Revision ID: 0017_earn_offer_ladder
Revises: 0016_subscriptions
Create Date: 2026-05-04

Adds nullable Text column `bitfinex_offer_ids` to earn_positions. When
ladder mode submits K offers per deposit, the column stores them as a
JSON array of int (e.g. "[12345, 12346, 12347, 12348, 12349]"). The
existing single-int column `bitfinex_offer_id` continues to hold the
primary tranche for backward compat.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_earn_offer_ladder"
down_revision: str | None = "0016_subscriptions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "earn_positions",
        sa.Column("bitfinex_offer_ids", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("earn_positions", "bitfinex_offer_ids")
