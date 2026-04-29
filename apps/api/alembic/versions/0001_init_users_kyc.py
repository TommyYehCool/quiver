"""init users and kyc_submissions

Revision ID: 0001_init
Revises:
Create Date: 2026-04-29

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_init"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("avatar_url", sa.String(length=1024), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("provider_user_id", sa.String(length=255), nullable=True),
        sa.Column(
            "roles",
            sa.ARRAY(sa.String()),
            server_default="{USER}",
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column(
            "locale",
            sa.String(length=8),
            server_default="zh-TW",
            nullable=False,
        ),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)

    op.create_table(
        "kyc_submissions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("legal_name", sa.String(length=255), nullable=True),
        sa.Column("id_number", sa.String(length=64), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("id_front_url", sa.String(length=1024), nullable=True),
        sa.Column("id_back_url", sa.String(length=1024), nullable=True),
        sa.Column("selfie_url", sa.String(length=1024), nullable=True),
        sa.Column("proof_of_address_url", sa.String(length=1024), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("reject_reason", sa.String(length=1024), nullable=True),
        sa.Column("reviewed_by", sa.BigInteger(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name=op.f("fk_kyc_submissions_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"],
            ["users.id"],
            name=op.f("fk_kyc_submissions_reviewed_by_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_kyc_submissions")),
    )
    op.create_index(
        op.f("ix_kyc_submissions_user_id"), "kyc_submissions", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_kyc_submissions_status"), "kyc_submissions", ["status"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_kyc_submissions_status"), table_name="kyc_submissions")
    op.drop_index(op.f("ix_kyc_submissions_user_id"), table_name="kyc_submissions")
    op.drop_table("kyc_submissions")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
