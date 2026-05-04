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
    FRIEND = "friend"       # 前 N 名 self-service 連接者(perf fee 5%,F-4a)
    PUBLIC = "public"       # Self-service Path A 標準費率(perf fee 15%,F-4a)
    COMMERCIAL = "commercial"  # 預留:未來 platform-custody mode(commingled)


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


class EarnStrategyPreset(str, enum.Enum):
    """earn_accounts.strategy_preset — F-5a-3.5 risk dial.

    Affects how `_build_ladder` slices the deposit and how
    `_select_period_days` picks lock-up duration:

      - CONSERVATIVE: most weight on baseline rate, short lock-ups (≤ 7d).
                      Trades upside for liquidity. Good for users who may
                      want to withdraw soon.
      - BALANCED:     current production behaviour (60/20/10/7/3 ladder
                      with 2/7/14/30 day periods). Default for new users.
      - AGGRESSIVE:   more weight on high-premium tranches, longer lock-ups
                      (high-rate tranches lock up to 60d). Maximises spike
                      yield but funds may be unavailable longer.
    """

    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"


class EarnPositionStatus(str, enum.Enum):
    """earn_positions.status — Path A auto-lend pipeline state machine.

    pending_outbound  → 已決定要 auto-lend,還沒 broadcast
    onchain_in_flight → 已從 HOT broadcast 到 user.bitfinex_funding,等 Bitfinex credit
    funding_idle      → Bitfinex 已 credit 到 funding wallet,還沒掛 offer
    lent              → 已 submit funding offer,等借出/已借出
    closing           → user / 系統觸發 cancel offer,等 funds idle
    closed_external   → user 自己在 Bitfinex 提走 / cancel,Quiver sync 偵測為 closed
    failed            → pipeline 中途錯誤,需 admin 排查(audit log + alert)
    """

    PENDING_OUTBOUND = "pending_outbound"
    ONCHAIN_IN_FLIGHT = "onchain_in_flight"
    FUNDING_IDLE = "funding_idle"
    LENT = "lent"
    CLOSING = "closing"
    CLOSED_EXTERNAL = "closed_external"
    FAILED = "failed"


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

    # F-Phase 3 Path A — auto-lend pipeline
    auto_lend_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    # toggle B(default on,user 可關)。Off 不阻止已 lent 部位自然到期,只阻
    # 新 deposit 進 auto-lend pipeline。
    strategy_preset: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="balanced"
    )
    # F-5a-3.5: risk dial. EarnStrategyPreset.CONSERVATIVE / BALANCED / AGGRESSIVE.
    # Drives ladder slicing + period selection in services/earn/auto_lend.py.
    dunning_pause_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # F-5b-2: true iff perf_fee.settle_outstanding paused this account's
    # auto-lend after >=4 consecutive unpaid weekly accruals. When the user
    # tops up their Quiver wallet enough to settle all ACCRUED rows, the same
    # cron flips this back to false and re-enables auto_lend_enabled. This
    # flag distinguishes "Quiver paused" from "user toggled off" so we know
    # whether to auto-resume.
    last_credits_check_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # F-5a-4.2: spike-capture watermark. Each reconcile run, we look for
    # active credits with opened_at_ms > last_credits_check_at AND apr_pct
    # >= SPIKE_APR_THRESHOLD; those are the new captures we notify on.
    # Then we update this to now(). server_default ensures existing accounts
    # don't fire spam notifications on backlog credits at deploy time.
    bitfinex_funding_address: Mapped[str | None] = mapped_column(String(64))
    # cache 從 Bitfinex API 撈出的 user TRC20 USDT funding wallet 入金地址。
    # 第一次 connect 時 fetch + 存,之後 broadcast 前可 refresh 防止 user 在
    # Bitfinex 端 rotate。

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
    encrypted_api_key: Mapped[str | None] = mapped_column(Text)
    encrypted_api_secret: Mapped[str | None] = mapped_column(Text)
    # base64-encoded envelope blob(同 totp_secret_enc 風格)
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


# ─────────────────────────────────────────────────────────
# EarnPosition (F-Phase 3 / Path A)
# ─────────────────────────────────────────────────────────


class EarnPosition(Base):
    """Path A auto-lend pipeline 每筆部位的 state machine row。

    一筆 deposit 觸發 → 一筆 EarnPosition,跟著 status enum 走完整 pipeline。
    Bitfinex 部位的「funding/lent/interest」細節由 EarnPositionSnapshot 表達,
    這裡只記 lifecycle event 跟 onchain/exchange ID 對應。
    """

    __tablename__ = "earn_positions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    earn_account_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("earn_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(24), nullable=False, server_default="pending_outbound"
    )
    # EarnPositionStatus enum value

    amount: Mapped[Decimal] = mapped_column(Numeric(38, 6), nullable=False)
    # 原始 deposit 金額(USDT)— Bitfinex 之後實際借出可能不同(部分 fill)

    currency: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="USDT-TRC20"
    )

    # onchain broadcast(HOT → user.bitfinex_funding_address)
    onchain_tx_hash: Mapped[str | None] = mapped_column(String(128), index=True)
    onchain_broadcast_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bitfinex_credited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Bitfinex side
    bitfinex_offer_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    # F-5a-3.3: ladder mode submits K offers per position (different rates).
    # Stored as JSON array of int. When laddered, bitfinex_offer_id holds the
    # primary tranche (largest amount, lowest rate — for backward-compat with
    # UI / reconcile code that reads a single ID). Reconcile parses this list
    # to determine if ALL tranches have closed before marking position closed.
    bitfinex_offer_ids: Mapped[str | None] = mapped_column(Text)
    bitfinex_offer_submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    # closing
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_reason: Mapped[str | None] = mapped_column(String(64))
    # "user_external_withdraw" / "platform_redeem" / "failed:<reason>"

    # diagnostics
    last_error: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default="0"
    )

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
    def is_terminal(self) -> bool:
        return self.status in (
            EarnPositionStatus.CLOSED_EXTERNAL.value,
            EarnPositionStatus.FAILED.value,
        )
