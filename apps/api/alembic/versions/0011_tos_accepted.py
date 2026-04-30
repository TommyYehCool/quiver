"""users.tos_accepted_at + tos_version

Revision ID: 0011_tos_accepted
Revises: 0010_audit_logs
Create Date: 2026-04-30

phase 6E-5:
  - 註冊 / 第一次登入時必須勾選同意 TOS + Privacy
  - 既有用戶寬限:backfill tos_accepted_at = created_at(他們已經在用了)
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_tos_accepted"
down_revision: str | None = "0010_audit_logs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("tos_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("tos_version", sa.String(length=16), nullable=True),
    )
    # backfill — 既有用戶視為已接受(他們在 TOS 制度上線前就已使用本服務)
    op.execute(
        "UPDATE users SET tos_accepted_at = created_at, tos_version = 'pre-tos' "
        "WHERE tos_accepted_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("users", "tos_version")
    op.drop_column("users", "tos_accepted_at")
