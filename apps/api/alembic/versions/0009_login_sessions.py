"""login sessions + account deletion fields

Revision ID: 0009_login_sessions
Revises: 0008_notifications
Create Date: 2026-04-30

phase 6E-1:
  - login_sessions: 用戶每次登入一筆,JWT jti 對應,可單獨 revoke
  - users.deletion_requested_at / deletion_completed_at: GDPR 刪除流程
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_login_sessions"
down_revision: str | None = "0008_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "login_sessions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_login_sessions")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_login_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("jti", name=op.f("uq_login_sessions_jti")),
    )
    op.create_index(op.f("ix_login_sessions_user_id"), "login_sessions", ["user_id"])
    op.create_index(op.f("ix_login_sessions_revoked_at"), "login_sessions", ["revoked_at"])

    op.add_column(
        "users",
        sa.Column("deletion_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("deletion_completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "deletion_completed_at")
    op.drop_column("users", "deletion_requested_at")
    op.drop_index(op.f("ix_login_sessions_revoked_at"), table_name="login_sessions")
    op.drop_index(op.f("ix_login_sessions_user_id"), table_name="login_sessions")
    op.drop_table("login_sessions")
