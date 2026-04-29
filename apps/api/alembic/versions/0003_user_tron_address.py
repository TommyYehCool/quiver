"""user tron_address

Revision ID: 0003_user_tron_address
Revises: 0002_system_keys
Create Date: 2026-04-29

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_user_tron_address"
down_revision: str | None = "0002_system_keys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("tron_address", sa.String(length=34), nullable=True),
    )
    op.create_index(
        op.f("ix_users_tron_address"),
        "users",
        ["tron_address"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_users_tron_address"), table_name="users")
    op.drop_column("users", "tron_address")
