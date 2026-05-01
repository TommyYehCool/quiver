"""Earn Friends Tooling — unified schema for Friends + future Commercial.

Revision ID: 0013_earn_friends_tooling
Revises: 0012_2fa_whitelist
Create Date: 2026-05-01

phase 9 / Friends Tooling F-Phase 1 D1:
  - users.earn_tier ('none' | 'internal' | 'friend' | 'commercial')
  - earn_accounts:統一帳戶,custody_mode + perf_fee_bps + can_quiver_operate flags
  - earn_bitfinex_connections:Bitfinex API key 連線(self vs platform key)
  - earn_evm_addresses:EVM 地址(self-custody friend wallet vs platform HOT)
  - earn_position_snapshots:每日部位歷史
  - earn_fee_accruals:抽成 / perf fee 結算紀錄(Phase 1 預設 perf_fee_bps=0,故會空)

設計理念見 docs/EARN-FRIENDS-TOOLING-PLAN.md。
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_earn_friends_tooling"
down_revision: str | None = "0012_2fa_whitelist"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ─────────────────────────────────────────────────────────
    # 1. users.earn_tier
    # ─────────────────────────────────────────────────────────
    op.add_column(
        "users",
        sa.Column(
            "earn_tier",
            sa.String(16),
            nullable=False,
            server_default="none",
        ),
    )
    # 'none' = 沒參與 Earn(預設,既有 wallet 用戶)
    # 'internal' = Tommy 自己 / admin
    # 'friend' = friends-only(self-custody, no fee / 後期可加 fee)
    # 'commercial' = V0.5 公開用戶(platform-custody, perf fee 或 SaaS 訂閱)

    # ─────────────────────────────────────────────────────────
    # 2. earn_accounts
    # ─────────────────────────────────────────────────────────
    op.create_table(
        "earn_accounts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        # 核心 mode flags
        sa.Column("custody_mode", sa.String(16), nullable=False),
        # "self" / "platform"
        sa.Column(
            "perf_fee_bps",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        # 0 = friends, 1500 = V0.5 (15%), in basis points (10000 = 100%)
        sa.Column(
            "can_quiver_operate",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        # F-Phase 3 / V0.5 才 true
        # onboarding metadata
        sa.Column("onboarded_by", sa.BigInteger(), nullable=True),
        sa.Column(
            "risk_acknowledged_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_earn_accounts")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_earn_accounts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["onboarded_by"], ["users.id"],
            name=op.f("fk_earn_accounts_onboarded_by_users"),
        ),
        sa.UniqueConstraint("user_id", name=op.f("uq_earn_accounts_user_id")),
    )

    # ─────────────────────────────────────────────────────────
    # 3. earn_bitfinex_connections
    # ─────────────────────────────────────────────────────────
    op.create_table(
        "earn_bitfinex_connections",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("earn_account_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "is_platform_key",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        # True  = 用 Quiver platform 共用 key(Commercial mode,Phase 1 都是 false)
        # False = 用此朋友 / 用戶自己的 key
        sa.Column("encrypted_api_key", sa.Text(), nullable=True),
        sa.Column("encrypted_api_secret", sa.Text(), nullable=True),
        # base64-encoded envelope blob(同 totp_secret_enc 風格)
        # nullable: is_platform_key=True 時不存(走 platform 共用 key)
        sa.Column("key_version", sa.SmallInteger(), nullable=True),
        sa.Column("permissions", sa.String(32), nullable=False),
        # "read" / "read+funding-write"
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_earn_bitfinex_connections")),
        sa.ForeignKeyConstraint(
            ["earn_account_id"], ["earn_accounts.id"],
            name=op.f("fk_earn_bitfinex_connections_earn_account_id"),
            ondelete="CASCADE",
        ),
    )
    # partial index:只 index 還沒撤銷的 connection
    op.create_index(
        "ix_earn_bitfinex_conn_active",
        "earn_bitfinex_connections",
        ["earn_account_id"],
        postgresql_where=sa.text("revoked_at IS NULL"),
    )

    # ─────────────────────────────────────────────────────────
    # 4. earn_evm_addresses
    # ─────────────────────────────────────────────────────────
    op.create_table(
        "earn_evm_addresses",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("earn_account_id", sa.BigInteger(), nullable=False),
        sa.Column("chain", sa.String(32), nullable=False),
        # "polygon" / "ethereum" / etc.
        sa.Column("address", sa.String(64), nullable=False),
        sa.Column(
            "is_platform_address",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        # platform 模式 = True(指向 Quiver EVM HOT)
        sa.Column("label", sa.String(64), nullable=True),
        # "Alice MetaMask" / "Alice Ledger"
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_earn_evm_addresses")),
        sa.ForeignKeyConstraint(
            ["earn_account_id"], ["earn_accounts.id"],
            name=op.f("fk_earn_evm_addresses_earn_account_id"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_earn_evm_addresses_account",
        "earn_evm_addresses",
        ["earn_account_id"],
    )

    # ─────────────────────────────────────────────────────────
    # 5. earn_position_snapshots
    # ─────────────────────────────────────────────────────────
    op.create_table(
        "earn_position_snapshots",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("earn_account_id", sa.BigInteger(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        # Bitfinex 部位
        sa.Column(
            "bitfinex_funding_usdt", sa.Numeric(38, 18), nullable=True
        ),  # Funding wallet idle
        sa.Column(
            "bitfinex_lent_usdt", sa.Numeric(38, 18), nullable=True
        ),  # 已借出 (active credits)
        sa.Column(
            "bitfinex_daily_earned", sa.Numeric(38, 18), nullable=True
        ),  # 當日結算
        # AAVE 部位
        sa.Column(
            "aave_polygon_usdt", sa.Numeric(38, 18), nullable=True
        ),
        sa.Column(
            "aave_daily_apr", sa.Numeric(8, 6), nullable=True
        ),  # 0.038 = 3.8%
        # 統合
        sa.Column("total_usdt", sa.Numeric(38, 18), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_earn_position_snapshots")),
        sa.ForeignKeyConstraint(
            ["earn_account_id"], ["earn_accounts.id"],
            name=op.f("fk_earn_position_snapshots_earn_account_id"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "earn_account_id",
            "snapshot_date",
            name=op.f("uq_earn_position_snapshots_account_date"),
        ),
    )
    op.create_index(
        "ix_earn_position_snapshots_date",
        "earn_position_snapshots",
        ["snapshot_date"],
    )

    # ─────────────────────────────────────────────────────────
    # 6. earn_fee_accruals(Phase 1 perf_fee_bps=0 時不會有 row,但 schema 先建好)
    # ─────────────────────────────────────────────────────────
    op.create_table(
        "earn_fee_accruals",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("earn_account_id", sa.BigInteger(), nullable=False),
        # 結算期間
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("earnings_amount", sa.Numeric(38, 18), nullable=False),
        sa.Column("fee_bps_applied", sa.Integer(), nullable=False),
        sa.Column("fee_amount", sa.Numeric(38, 18), nullable=False),
        # 結算狀態
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default="ACCRUED",
        ),
        # "ACCRUED" / "PAID" / "WAIVED"
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_method", sa.String(32), nullable=True),
        # "tron_usdt" / "platform_deduction" / "manual_offline"
        sa.Column("paid_tx_hash", sa.String(128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_earn_fee_accruals")),
        sa.ForeignKeyConstraint(
            ["earn_account_id"], ["earn_accounts.id"],
            name=op.f("fk_earn_fee_accruals_earn_account_id"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "earn_account_id",
            "period_start",
            "period_end",
            name=op.f("uq_earn_fee_accruals_account_period"),
        ),
    )
    op.create_index(
        "ix_earn_fee_accruals_unpaid",
        "earn_fee_accruals",
        ["earn_account_id"],
        postgresql_where=sa.text("status = 'ACCRUED'"),
    )


def downgrade() -> None:
    op.drop_index("ix_earn_fee_accruals_unpaid", table_name="earn_fee_accruals")
    op.drop_table("earn_fee_accruals")

    op.drop_index(
        "ix_earn_position_snapshots_date", table_name="earn_position_snapshots"
    )
    op.drop_table("earn_position_snapshots")

    op.drop_index("ix_earn_evm_addresses_account", table_name="earn_evm_addresses")
    op.drop_table("earn_evm_addresses")

    op.drop_index(
        "ix_earn_bitfinex_conn_active", table_name="earn_bitfinex_connections"
    )
    op.drop_table("earn_bitfinex_connections")

    op.drop_table("earn_accounts")

    op.drop_column("users", "earn_tier")
