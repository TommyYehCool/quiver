"""Earn USD pivot — F-5a-3.11.

Revision ID: 0024_earn_usd_pivot
Revises: 0023_funnel_events
Create Date: 2026-05-05

Two schema changes for the USD-lending pivot:

1. earn_positions.lending_currency (nullable str) — distinguishes legacy
   USDT positions (NULL or "USDT") from new USD positions ("USD"). Driven
   by services/earn/auto_lend.py + reconcile.py to fan out to
   currency-specific code paths. Existing rows stay NULL → treated as
   USDT by all callers (default-on-NULL semantics).

2. earn_accounts.usdt_buffer_pct (int, default 0) — user-configurable
   "保留不借出金額" %. On each new deposit, this fraction stays in the
   user's Quiver wallet (never bridged to Bitfinex), giving instant
   redemption headroom at the cost of forgoing yield on that slice.
   0..100; 0 = max yield, 50 = aggressive buffer.

Backfill considerations:
  - lending_currency: NULL on all existing rows = correct (legacy USDT)
  - usdt_buffer_pct: 0 on all existing rows = current behavior (no
    buffer — all deposits go to Bitfinex)

No data backfill needed; both columns have safe defaults and the
application code handles NULL/0 as the legacy case.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024_earn_usd_pivot"
down_revision: str | None = "0023_funnel_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. earn_positions.lending_currency
    op.add_column(
        "earn_positions",
        sa.Column("lending_currency", sa.String(length=8), nullable=True),
    )

    # 2. earn_accounts.usdt_buffer_pct
    op.add_column(
        "earn_accounts",
        sa.Column(
            "usdt_buffer_pct",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("earn_accounts", "usdt_buffer_pct")
    op.drop_column("earn_positions", "lending_currency")
