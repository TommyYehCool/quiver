"""Telegram binding columns on users — F-5a-4.1.

Revision ID: 0020_telegram_binding
Revises: 0019_earn_dunning_pause
Create Date: 2026-05-04

Adds:
  - users.telegram_chat_id (BigInteger, UNIQUE, indexed) — once bound,
    auto_lend events push notifications to this chat
  - users.telegram_username (String 64, cached for display / leaderboard)
  - users.telegram_bound_at (DateTime tz)
  - users.telegram_bind_code (String 16, UNIQUE, indexed) — one-time code
    user generates from /earn/bot-settings, used by webhook /start command
  - users.telegram_bind_code_expires_at (DateTime tz) — bind code TTL (30 min)

All nullable so existing users default to "not bound" without backfill.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_telegram_binding"
down_revision: str | None = "0019_earn_dunning_pause"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("telegram_username", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("telegram_bound_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("telegram_bind_code", sa.String(length=16), nullable=True))
    op.add_column(
        "users",
        sa.Column("telegram_bind_code_expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    # UNIQUE index on chat_id (one TG account ↔ one Quiver user)
    op.create_index(
        "ix_users_telegram_chat_id",
        "users",
        ["telegram_chat_id"],
        unique=True,
    )
    # UNIQUE index on bind_code (lookup at webhook /start, one-time)
    op.create_index(
        "ix_users_telegram_bind_code",
        "users",
        ["telegram_bind_code"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_users_telegram_bind_code", table_name="users")
    op.drop_index("ix_users_telegram_chat_id", table_name="users")
    op.drop_column("users", "telegram_bind_code_expires_at")
    op.drop_column("users", "telegram_bind_code")
    op.drop_column("users", "telegram_bound_at")
    op.drop_column("users", "telegram_username")
    op.drop_column("users", "telegram_chat_id")
