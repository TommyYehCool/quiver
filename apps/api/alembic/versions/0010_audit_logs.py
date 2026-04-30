"""audit_logs table

Revision ID: 0010_audit_logs
Revises: 0009_login_sessions
Create Date: 2026-04-30

phase 6E-3:
  獨立表記錄所有「值得追究的動作」 — 主要 admin 操作 + 部分用戶敏感動作。
  appendable-only,不會 update / delete。
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0010_audit_logs"
down_revision: str | None = "0009_login_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        # actor: 通常是 admin user_id(系統動作為 NULL)
        sa.Column("actor_id", sa.BigInteger(), nullable=True),
        sa.Column("actor_kind", sa.String(length=16), nullable=False),  # USER / ADMIN / SYSTEM
        sa.Column("action", sa.String(length=64), nullable=False),  # e.g. "kyc.approve"
        sa.Column("target_kind", sa.String(length=32), nullable=True),  # USER / KYC / WITHDRAWAL / ...
        sa.Column("target_id", sa.BigInteger(), nullable=True),
        sa.Column("payload", JSONB(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"],
            name=op.f("fk_audit_logs_actor_id_users"),
            ondelete="SET NULL",
        ),
    )
    op.create_index(op.f("ix_audit_logs_actor_id"), "audit_logs", ["actor_id"])
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"])
    op.create_index(op.f("ix_audit_logs_target"), "audit_logs", ["target_kind", "target_id"])
    op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_logs_created_at"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_target"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_action"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_actor_id"), table_name="audit_logs")
    op.drop_table("audit_logs")
