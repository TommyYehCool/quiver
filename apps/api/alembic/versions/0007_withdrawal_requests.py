"""withdrawal_requests

Revision ID: 0007_withdrawal_requests
Revises: 0006_ledger_tx_note
Create Date: 2026-04-30

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_withdrawal_requests"
down_revision: str | None = "0006_ledger_tx_note"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "withdrawal_requests",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("amount", sa.Numeric(30, 6), nullable=False),
        sa.Column("fee", sa.Numeric(30, 6), nullable=False),
        sa.Column("currency", sa.String(length=16), nullable=False, server_default="USDT-TRC20"),
        sa.Column("to_address", sa.String(length=34), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("ledger_tx_id", sa.BigInteger(), nullable=True),
        sa.Column("tx_hash", sa.String(length=80), nullable=True),
        sa.Column("reject_reason", sa.String(length=1024), nullable=True),
        sa.Column("reviewed_by", sa.BigInteger(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_withdrawal_requests")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_withdrawal_requests_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["ledger_tx_id"], ["ledger_transactions.id"],
            name=op.f("fk_withdrawal_requests_ledger_tx_id_ledger_transactions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"], ["users.id"],
            name=op.f("fk_withdrawal_requests_reviewed_by_users"),
        ),
        sa.UniqueConstraint("tx_hash", name=op.f("uq_withdrawal_requests_tx_hash")),
    )
    op.create_index(op.f("ix_withdrawal_requests_user_id"), "withdrawal_requests", ["user_id"])
    op.create_index(op.f("ix_withdrawal_requests_status"), "withdrawal_requests", ["status"])


def downgrade() -> None:
    op.drop_index(op.f("ix_withdrawal_requests_status"), table_name="withdrawal_requests")
    op.drop_index(op.f("ix_withdrawal_requests_user_id"), table_name="withdrawal_requests")
    op.drop_table("withdrawal_requests")
