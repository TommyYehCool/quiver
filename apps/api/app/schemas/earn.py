"""Pydantic schemas for Earn admin API。"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


# ─────────────────────────────────────────────────────────
# Common
# ─────────────────────────────────────────────────────────


class FriendUserOption(BaseModel):
    """既有 user 的精簡資料,給 admin 從下拉選友。"""

    id: int
    email: str
    display_name: str | None
    earn_tier: str  # 'none' / 'internal' / 'friend' / 'commercial'


# ─────────────────────────────────────────────────────────
# Create / list
# ─────────────────────────────────────────────────────────


class CreateEarnAccountIn(BaseModel):
    user_id: int = Field(..., description="既有 user.id,且 earn_tier 應為 'none' 或 'friend'")

    # tier: 'friend' / 'internal'(Phase 1 不允許 'commercial')
    earn_tier: str = Field(default="friend", pattern=r"^(friend|internal)$")

    # custody_mode 預設 self(F-Phase 1 唯一支援)
    custody_mode: str = Field(default="self", pattern=r"^(self|platform)$")

    # Phase 1 預設 0(無抽成),未來可改為 500 / 1500
    perf_fee_bps: int = Field(default=0, ge=0, le=5000)

    can_quiver_operate: bool = Field(default=False)

    # Bitfinex 連線
    bitfinex_api_key: str = Field(..., min_length=20, max_length=200)
    bitfinex_api_secret: str = Field(..., min_length=20, max_length=200)
    bitfinex_permissions: str = Field(default="read", pattern=r"^(read|read\+funding-write)$")

    # EVM 地址
    evm_polygon_address: str | None = Field(
        default=None, pattern=r"^0x[0-9a-fA-F]{40}$"
    )
    evm_label: str | None = Field(default=None, max_length=64)

    # 備註
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("bitfinex_api_key", "bitfinex_api_secret")
    @classmethod
    def _strip_whitespace(cls, v: str) -> str:
        return v.strip()


class EarnAccountOut(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_display_name: str | None
    earn_tier: str

    custody_mode: str
    perf_fee_bps: int
    can_quiver_operate: bool

    onboarded_by: int | None
    onboarded_by_email: str | None
    risk_acknowledged_at: datetime | None
    notes: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime

    has_active_bitfinex: bool
    bitfinex_permissions: str | None
    evm_addresses_count: int


class EarnAccountListOut(BaseModel):
    items: list[EarnAccountOut]
    total: int


# ─────────────────────────────────────────────────────────
# Detail (with positions)
# ─────────────────────────────────────────────────────────


class EvmAddressOut(BaseModel):
    id: int
    chain: str
    address: str
    is_platform_address: bool
    label: str | None
    created_at: datetime


class BitfinexConnectionOut(BaseModel):
    id: int
    is_platform_key: bool
    permissions: str
    has_key: bool  # True if encrypted_api_key present
    created_at: datetime
    revoked_at: datetime | None


class PositionSnapshotOut(BaseModel):
    snapshot_date: date
    bitfinex_funding_usdt: Decimal | None
    bitfinex_lent_usdt: Decimal | None
    bitfinex_daily_earned: Decimal | None
    aave_polygon_usdt: Decimal | None
    aave_daily_apr: Decimal | None
    total_usdt: Decimal | None


class EarnPipelinePositionOut(BaseModel):
    """F-Phase 3 Path A pipeline state — one row per deposit auto-lend cycle."""
    id: int
    status: str
    amount: Decimal
    currency: str
    onchain_tx_hash: str | None
    onchain_broadcast_at: datetime | None
    bitfinex_credited_at: datetime | None
    bitfinex_offer_id: int | None
    bitfinex_offer_submitted_at: datetime | None
    closed_at: datetime | None
    closed_reason: str | None
    last_error: str | None
    retry_count: int
    created_at: datetime


class EarnAccountDetailOut(EarnAccountOut):
    bitfinex_connections: list[BitfinexConnectionOut]
    evm_addresses: list[EvmAddressOut]
    recent_snapshots: list[PositionSnapshotOut]  # 最近 30 天
    # F-Phase 3 Path A:auto-lend pipeline positions (含 in-flight + recent closed)
    auto_lend_enabled: bool
    bitfinex_funding_address: str | None
    pipeline_positions: list[EarnPipelinePositionOut]


# ─────────────────────────────────────────────────────────
# Update
# ─────────────────────────────────────────────────────────


class UpdateEarnAccountIn(BaseModel):
    perf_fee_bps: int | None = Field(default=None, ge=0, le=5000)
    can_quiver_operate: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)
    archived: bool | None = None


# ─────────────────────────────────────────────────────────
# Sync trigger result
# ─────────────────────────────────────────────────────────


class SyncResultOut(BaseModel):
    earn_account_id: int
    success: bool
    bitfinex_funding_usdt: Decimal | None = None
    bitfinex_lent_usdt: Decimal | None = None
    aave_polygon_usdt: Decimal | None = None
    total_usdt: Decimal | None = None
    error: str | None = None


# ─────────────────────────────────────────────────────────
# Cross-account APY ranking
# ─────────────────────────────────────────────────────────


class FriendApySummary(BaseModel):
    """每個 friend 過去 30 天的 APY 表現總結。"""

    earn_account_id: int
    user_email: str
    user_display_name: str | None
    total_usdt: Decimal | None
    avg_30d_apy_pct: Decimal | None  # 0-100
    bitfinex_share_pct: Decimal | None  # 0-100
    aave_share_pct: Decimal | None
