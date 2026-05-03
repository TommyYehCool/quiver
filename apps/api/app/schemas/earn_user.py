"""Pydantic schemas for the user-facing Earn API (F-Phase 3 / Path A self-service).

Mirrors a subset of the admin earn schemas but never exposes admin-only fields
(perf_fee_bps, can_quiver_operate, onboarded_by) since users see only their
own account.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


# ─────────────────────────────────────────────────────────
# GET /api/earn/me
# ─────────────────────────────────────────────────────────


class EarnPositionUserOut(BaseModel):
    id: int
    status: str  # EarnPositionStatus
    amount: Decimal
    onchain_tx_hash: str | None
    onchain_broadcast_at: datetime | None
    bitfinex_credited_at: datetime | None
    bitfinex_offer_id: int | None
    bitfinex_offer_submitted_at: datetime | None
    closed_at: datetime | None
    last_error: str | None


class EarnSnapshotUserOut(BaseModel):
    snapshot_date: date
    bitfinex_funding_usdt: Decimal | None
    bitfinex_lent_usdt: Decimal | None
    bitfinex_daily_earned: Decimal | None


class ActiveCreditOut(BaseModel):
    """Live snapshot of one active funding credit (= money currently lent at Bitfinex)."""
    id: int
    amount: Decimal
    rate_daily: Decimal              # 0.0001 = 0.01% / day
    apr_pct: Decimal                 # annualised %
    period_days: int
    opened_at_ms: int
    expires_at_ms: int
    expected_interest_at_expiry: Decimal


class EarnMeOut(BaseModel):
    """Everything the user needs on /earn:KYC gate, account state, positions."""

    # Gates
    kyc_status: str  # PENDING / APPROVED / REJECTED / NONE
    can_connect: bool  # KYC approved + no archived account in the way

    # Account state (None / false / empty if no earn_account yet)
    has_earn_account: bool
    auto_lend_enabled: bool
    bitfinex_connected: bool
    bitfinex_funding_address: str | None  # cached deposit address

    # Live position summary (latest snapshot or computed)
    funding_idle_usdt: Decimal | None  # USDT in funding wallet, not lent
    lent_usdt: Decimal | None           # USDT actively lent out
    daily_earned_usdt: Decimal | None   # last snapshot daily earnings (estimate)
    total_at_bitfinex: Decimal | None   # funding_idle + lent (total at Bitfinex)

    # In-flight pipeline state for transparency (e.g., "200 USDT broadcast, awaiting Bitfinex credit")
    active_positions: list[EarnPositionUserOut]

    # Live active loans at Bitfinex (each with rate + expiry)
    active_credits: list[ActiveCreditOut]

    # Trend (last N days)
    recent_snapshots: list[EarnSnapshotUserOut]


# ─────────────────────────────────────────────────────────
# PATCH /api/earn/settings
# ─────────────────────────────────────────────────────────


class EarnSettingsUpdateIn(BaseModel):
    auto_lend_enabled: bool | None = None


class EarnSettingsOut(BaseModel):
    auto_lend_enabled: bool


# ─────────────────────────────────────────────────────────
# POST /api/earn/connect
# ─────────────────────────────────────────────────────────


class EarnConnectIn(BaseModel):
    bitfinex_api_key: str = Field(..., min_length=20, max_length=200)
    bitfinex_api_secret: str = Field(..., min_length=20, max_length=200)
    # Funding wallet TRC20 deposit address — user pastes from their Bitfinex
    # web UI (Wallets → Deposit → USDT → TRX → Funding wallet address).
    # Bitfinex's API for fetching this requires a write-level permission we
    # deliberately don't grant, so we accept manual entry instead.
    bitfinex_funding_address: str = Field(
        ..., pattern=r"^T[1-9A-HJ-NP-Za-km-z]{33}$",
        description="34-char Tron address starting with T",
    )

    @field_validator("bitfinex_api_key", "bitfinex_api_secret", "bitfinex_funding_address")
    @classmethod
    def _strip_whitespace(cls, v: str) -> str:
        return v.strip()


class EarnConnectOut(BaseModel):
    earn_account_id: int
    bitfinex_funding_address: str
    auto_lend_enabled: bool
    # Confirmation that the Bitfinex key actually works (we tested it):
    bitfinex_funding_balance: Decimal
