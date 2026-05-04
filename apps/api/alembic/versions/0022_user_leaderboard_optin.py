"""User leaderboard opt-in flag — F-5a-4.3.

Revision ID: 0022_user_leaderboard_optin
Revises: 0021_earn_credits_check_at
Create Date: 2026-05-04

Adds users.show_on_leaderboard. Default FALSE — even users who bind
Telegram start anonymous on /rank (shown as "Anonymous #XXXX" stable
hash). They must explicitly opt in from /earn/bot-settings to expose
their @username on the public leaderboard.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_user_leaderboard_optin"
down_revision: str | None = "0021_earn_credits_check_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "show_on_leaderboard",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "show_on_leaderboard")
