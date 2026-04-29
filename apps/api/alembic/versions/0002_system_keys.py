"""system_keys

Revision ID: 0002_system_keys
Revises: 0001_init
Create Date: 2026-04-29

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_system_keys"
down_revision: str | None = "0001_init"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "system_keys",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("kek_hash", sa.String(length=64), nullable=False),
        sa.Column("master_seed_ciphertext", sa.String(), nullable=True),
        sa.Column("key_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_system_keys")),
    )


def downgrade() -> None:
    op.drop_table("system_keys")
