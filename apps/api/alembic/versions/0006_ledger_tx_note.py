"""ledger_transactions.note

Revision ID: 0006_ledger_tx_note
Revises: 0005_user_tatum_sub
Create Date: 2026-04-30

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_ledger_tx_note"
down_revision: str | None = "0005_user_tatum_sub"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ledger_transactions",
        sa.Column("note", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ledger_transactions", "note")
