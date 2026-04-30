"""onchain_txs + accounts + ledger_transactions + ledger_entries

Revision ID: 0004_phase_3c_ledger
Revises: 0003_user_tron_address
Create Date: 2026-04-29

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0004_phase_3c_ledger"
down_revision: str | None = "0003_user_tron_address"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "onchain_txs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("tx_hash", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("to_address", sa.String(length=34), nullable=False),
        sa.Column("amount", sa.Numeric(30, 6), nullable=False),
        sa.Column("currency", sa.String(length=16), nullable=False, server_default="USDT-TRC20"),
        sa.Column("block_number", sa.BigInteger(), nullable=True),
        sa.Column("confirmations", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PROVISIONAL"),
        sa.Column("raw_payload", JSONB(), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_onchain_txs")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_onchain_txs_user_id_users"), ondelete="CASCADE"),
        sa.UniqueConstraint("tx_hash", name=op.f("uq_onchain_txs_tx_hash")),
    )
    op.create_index(op.f("ix_onchain_txs_tx_hash"), "onchain_txs", ["tx_hash"])
    op.create_index(op.f("ix_onchain_txs_user_id"), "onchain_txs", ["user_id"])
    op.create_index(op.f("ix_onchain_txs_status"), "onchain_txs", ["status"])

    op.create_table(
        "accounts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("currency", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_accounts")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_accounts_user_id_users"), ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "kind", "currency", name="uq_accounts_user_kind_currency"),
    )
    op.create_index(op.f("ix_accounts_user_id"), "accounts", ["user_id"])

    op.create_table(
        "ledger_transactions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("type", sa.String(length=24), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="POSTED"),
        sa.Column("onchain_tx_id", sa.BigInteger(), nullable=True),
        sa.Column("amount", sa.Numeric(30, 6), nullable=False),
        sa.Column("currency", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ledger_transactions")),
        sa.ForeignKeyConstraint(
            ["onchain_tx_id"], ["onchain_txs.id"],
            name=op.f("fk_ledger_transactions_onchain_tx_id_onchain_txs"),
            ondelete="SET NULL",
        ),
    )
    op.create_index(op.f("ix_ledger_transactions_type"), "ledger_transactions", ["type"])
    op.create_index(op.f("ix_ledger_transactions_onchain_tx_id"), "ledger_transactions", ["onchain_tx_id"])

    op.create_table(
        "ledger_entries",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("ledger_tx_id", sa.BigInteger(), nullable=False),
        sa.Column("account_id", sa.BigInteger(), nullable=False),
        sa.Column("direction", sa.String(length=8), nullable=False),
        sa.Column("amount", sa.Numeric(30, 6), nullable=False),
        sa.Column("currency", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ledger_entries")),
        sa.ForeignKeyConstraint(
            ["ledger_tx_id"], ["ledger_transactions.id"],
            name=op.f("fk_ledger_entries_ledger_tx_id_ledger_transactions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["accounts.id"],
            name=op.f("fk_ledger_entries_account_id_accounts"),
            ondelete="RESTRICT",
        ),
    )
    op.create_index(op.f("ix_ledger_entries_ledger_tx_id"), "ledger_entries", ["ledger_tx_id"])
    op.create_index(op.f("ix_ledger_entries_account_id"), "ledger_entries", ["account_id"])

    # 建一個 PLATFORM_CUSTODY USDT-TRC20 帳戶(全平台一個)
    op.execute(
        "INSERT INTO accounts (user_id, kind, currency, created_at, updated_at) "
        "VALUES (NULL, 'PLATFORM_CUSTODY', 'USDT-TRC20', now(), now())"
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_ledger_entries_account_id"), table_name="ledger_entries")
    op.drop_index(op.f("ix_ledger_entries_ledger_tx_id"), table_name="ledger_entries")
    op.drop_table("ledger_entries")
    op.drop_index(op.f("ix_ledger_transactions_onchain_tx_id"), table_name="ledger_transactions")
    op.drop_index(op.f("ix_ledger_transactions_type"), table_name="ledger_transactions")
    op.drop_table("ledger_transactions")
    op.drop_index(op.f("ix_accounts_user_id"), table_name="accounts")
    op.drop_table("accounts")
    op.drop_index(op.f("ix_onchain_txs_status"), table_name="onchain_txs")
    op.drop_index(op.f("ix_onchain_txs_user_id"), table_name="onchain_txs")
    op.drop_index(op.f("ix_onchain_txs_tx_hash"), table_name="onchain_txs")
    op.drop_table("onchain_txs")
