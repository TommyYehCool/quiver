"""user tatum subscription columns

Revision ID: 0005_user_tatum_sub
Revises: 0004_phase_3c_ledger
Create Date: 2026-04-30

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_user_tatum_sub"
down_revision: str | None = "0004_phase_3c_ledger"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("tatum_sub_id", sa.String(length=64), nullable=True))
    op.add_column(
        "users", sa.Column("tatum_sub_callback_url", sa.String(length=512), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "tatum_sub_callback_url")
    op.drop_column("users", "tatum_sub_id")
