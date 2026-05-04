"""Onboarding funnel events table — F-5b-4.

Revision ID: 0023_funnel_events
Revises: 0022_user_leaderboard_optin
Create Date: 2026-05-04

Lightweight per-user event log for tracking onboarding funnel
(signup → tos → kyc → bitfinex connect → first lent). Mixpanel-style.

Why a new table instead of reusing audit_logs:
  - audit_logs is "actor did action on target" — admin-action centric
  - funnel events are "user reached state X" — user/system centric
  - Separate table keeps queries fast (single-purpose index by event_name +
    created_at, plus per-user lookup)

NOT a replacement for audit_logs — those still log compliance-relevant
admin actions. This is purely product analytics.

Backfill: handled in a separate data migration step (called from /admin
or run once via shell). This DDL migration just creates the table.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023_funnel_events"
down_revision: str | None = "0022_user_leaderboard_optin"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "funnel_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_name", sa.String(length=64), nullable=False),
        # JSONB so we can index/filter by properties later if needed
        sa.Column("properties", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    # Per-user lookup (e.g., "what's user X's last event?")
    op.create_index(
        "ix_funnel_events_user_id_created_at",
        "funnel_events",
        ["user_id", sa.text("created_at DESC")],
    )
    # Aggregate by event over time window (e.g., "how many signups today?")
    op.create_index(
        "ix_funnel_events_event_name_created_at",
        "funnel_events",
        ["event_name", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_funnel_events_event_name_created_at", table_name="funnel_events")
    op.drop_index("ix_funnel_events_user_id_created_at", table_name="funnel_events")
    op.drop_table("funnel_events")
