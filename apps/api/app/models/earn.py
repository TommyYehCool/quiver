"""Earn models — Friends Tooling + future Commercial 共用 schema。

設計理念見 docs/EARN-FRIENDS-TOOLING-PLAN.md。

Phase 1 (Friends Tooling) 用 EarnAccount with custody_mode='self', perf_fee_bps=0。
Future V0.5 (Commercial) 加新 row with custody_mode='platform', perf_fee_bps=1500。
Code 完全共用,只是 row flag 不同。
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


# ─────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────


class EarnTier(str, enum.Enum):
    """users.earn_tier — 區分用戶在 Earn 系統的角色。"""

    NONE = "none"           # 沒參與 Earn(預設,既有 wallet 用戶)
    INTERNAL = "internal"   # Tommy 自己 / admin
    FRIEND = "friend"       # Friends Tooling(self-custody)
    COMMERCIAL = "commercial"  # 未來 V0.5 公開用戶


class CustodyMode(str, enum.Enum):
    """earn_accounts.custody_mode — 資金保管模式。"""

    SELF = "self"           # 朋友 / 用戶自己保管(在自己的 Bitfinex 帳戶 / EVM wallet)
    PLATFORM = "platform"   # Quiver platform 統一管理(commingled,V0.5 用)


class BitfinexPermissions(str, enum.Enum):
    """earn_bitfinex_connections.permissions"""

    READ = "read"                              # 純讀(F-Phase 1 預設)
    READ_FUNDING_WRITE = "read+funding-write"  # 加 submit/cancel offer(F-Phase 3 / V0.5)


class FeeAccrualStatus(str, enum.Enum):
    """earn_fee_accruals.status"""

    ACCRUED = "ACCRUED"   # 已計算還沒收
    PAID = "PAID"         # 已收
    WAIVED = "WAIVED"     # Tommy 特赦不收(朋友請吃飯抵)


class FeePaidMethod(str, enum.Enum):
    """earn_fee_accruals.paid_method"""

    TRON_USDT = "tron_usdt"                   # 朋友從自己錢包匯 USDT
    PLATFORM_DEDUCTION = "platform_deduction"  # Commercial 模式自動從虛擬餘額扣
    MANUAL_OFFLINE = "manual_offline"          # 朋友直接給現金 / 請吃飯,Tommy 手動 mark


# ─────────────────────────────────────────────────────────
# EarnAccount
# ─────────────────────────────────────────────────────────


class EarnAccount(Base):
    """Earn 帳戶 — Friends + Commercial 共用。

    一個 user 對應一個 earn_account(`UNIQUE (user_id)`)。
    """

    __tablename__ = "earn_accounts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # 核心 mode flags
    custody_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    # CustodyMode.SELF / .PLATFORM
    perf_fee_bps: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    # 0 = friends, 500 = 5%, 1500 = 15% (in basis points)
    can_quiver_operate: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # F-Phase 3 / V0.5 才 true(允許 Quiver 主動下 offer / cancel / rebalance)

    # onboarding metadata
    onboarded_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=True
    )
    risk_acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    notes: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    @property
    def is_active(self) -> bool:
        return self.archived_at is None

    @property
    def is_self_custody(self) -> bool:
        return self.custody_mode == CustodyMode.SELF.value

    @property
    def perf_fee_pct(self) -> Decimal:
        """0.15 表 15%。"""
        return Decimal(self.perf_fee_bps) / Decimal(10000)


# ─────────────────────────────────────────────────────────
# EarnBitfinexConnection
# ─────────────────────────────────────────────────────────


class EarnBitfinexConnection(Base):
    """Bitfinex API key 連線。

    self-custody mode:存朋友 / 用戶自己的加密 key。
    platform mode (is_platform_key=True):不存個別 key,跑 Quiver platform 共用 key。
    """

    __tablename__ = "earn_bitfinex_connections"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    earn_account_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("earn_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    is_platform_key: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    encrypted_api_key: Mapped[bytes | None] = mapped_column(LargeBinary)
    encrypted_api_secret: Mapped[bytes | None] = mapped_column(LargeBinary)
    key_version: Mapped[int | None] = mapped_column(SmallInteger)
    permissions: Mapped[str] = mapped_column(String(32), nullable=False)
    # BitfinexPermissions.READ / .READ_FUNDING_WRITE

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    @property
    def can_write_funding(self) -> bool:
        return self.permissions == BitfinexPermissions.READ_FUNDING_WRITE.value


# ─────────────────────────────────────────────────────────
# EarnEvmAddress
# ─────────────────────────────────────────────────────────


class EarnEvmAddress(Base):
    """EVM 地址(self-custody 是朋友 wallet,platform 是 Quiver EVM HOT)。"""

    __tablename__ = "earn_evm_addresses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    earn_account_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("earn_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chain: Mapped[str] = mapped_column(String(32), nullable=False)
    # "polygon" / "ethereum" / etc.
    address: Mapped[str] = mapped_column(String(64), nullable=False)
    is_platform_address: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    label: Mapped[str | None] = mapped_column(String(64))
    # "Alice MetaMask" / "Alice Ledger"

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─────────────────────────────────────────────────────────
# EarnPositionSnapshot
# ─────────────────────────────────────────────────────────


class EarnPositionSnapshot(Base):
    """每日部位快照 — 用於追蹤 APY trend。每天一個 earn_account 一筆。"""

    __tablename__ = "earn_position_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "earn_account_id",
            "snapshot_date",
            name="uq_earn_position_snapshots_account_date",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    earn_account_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("earn_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Bitfinex 部位
    bitfinex_funding_usdt: Mapped[Decimal | None] = mapped_column(Numeric(38, 18))
    bitfinex_lent_usdt: Mapped[Decimal | None] = mapped_column(Numeric(38, 18))
    bitfinex_daily_earned: Mapped[Decimal | None] = mapped_column(Numeric(38, 18))

    # AAVE 部位
    aave_polygon_usdt: Mapped[Decimal | None] = mapped_column(Numeric(38, 18))
    aave_daily_apr: Mapped[Decimal | None] = mapped_column(Numeric(8, 6))
    # 0.038 = 3.8%

    # 統合
    total_usdt: Mapped[Decimal | None] = mapped_column(Numeric(38, 18))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─────────────────────────────────────────────────────────
# EarnFeeAccrual
# ─────────────────────────────────────────────────────────


class EarnFeeAccrual(Base):
    """抽成 / perf fee 結算紀錄。

    Phase 1 預設 perf_fee_bps=0 → 此表不會有 row。
    將來 friend 改抽成 / V0.5 上線都自動會有 row。
    """

    __tablename__ = "earn_fee_accruals"
    __table_args__ = (
        UniqueConstraint(
            "earn_account_id",
            "period_start",
            "period_end",
            name="uq_earn_fee_accruals_account_period",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    earn_account_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("earn_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )

    # 結算期間
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    earnings_amount: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    fee_bps_applied: Mapped[int] = mapped_column(Integer, nullable=False)
    fee_amount: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)

    # 結算狀態
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="ACCRUED"
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_method: Mapped[str | None] = mapped_column(String(32))
    paid_tx_hash: Mapped[str | None] = mapped_column(String(128))
    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    @property
    def is_paid(self) -> bool:
        return self.status == FeeAccrualStatus.PAID.value
