"""2FA TOTP + withdrawal whitelist

Revision ID: 0012_2fa_whitelist
Revises: 0011_tos_accepted
Create Date: 2026-04-30

phase 6E-2:
  - users.totp_secret_enc / totp_key_version / totp_enabled_at
  - users.withdrawal_whitelist_only(bool default false)
  - totp_backup_codes:8 個一次性 backup codes,只存 hash
  - withdrawal_whitelist:用戶白名單地址,24hr cooldown 才能用
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_2fa_whitelist"
down_revision: str | None = "0011_tos_accepted"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # users 加 TOTP 欄 + whitelist_only
    op.add_column("users", sa.Column("totp_secret_enc", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("totp_key_version", sa.SmallInteger(), nullable=True))
    op.add_column("users", sa.Column("totp_enabled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "withdrawal_whitelist_only",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # backup codes
    op.create_table(
        "totp_backup_codes",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("code_hash", sa.String(length=128), nullable=False),  # sha256 hex
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_totp_backup_codes")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_totp_backup_codes_user_id_users"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_totp_backup_codes_user_id"), "totp_backup_codes", ["user_id"]
    )

    # whitelist
    op.create_table(
        "withdrawal_whitelist",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("address", sa.String(length=34), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        # activated_at 為未來時間 → 還在冷靜期;= NULL → 已 removed
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_withdrawal_whitelist")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_withdrawal_whitelist_user_id_users"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_withdrawal_whitelist_user_id"), "withdrawal_whitelist", ["user_id"]
    )
    op.create_index(
        op.f("ix_withdrawal_whitelist_removed_at"), "withdrawal_whitelist", ["removed_at"]
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_withdrawal_whitelist_removed_at"), table_name="withdrawal_whitelist"
    )
    op.drop_index(
        op.f("ix_withdrawal_whitelist_user_id"), table_name="withdrawal_whitelist"
    )
    op.drop_table("withdrawal_whitelist")

    op.drop_index(op.f("ix_totp_backup_codes_user_id"), table_name="totp_backup_codes")
    op.drop_table("totp_backup_codes")

    op.drop_column("users", "withdrawal_whitelist_only")
    op.drop_column("users", "totp_enabled_at")
    op.drop_column("users", "totp_key_version")
    op.drop_column("users", "totp_secret_enc")
