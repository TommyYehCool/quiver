"""Pydantic schemas for the user-facing Earn API (F-Phase 3 / Path A self-service).

Mirrors a subset of the admin earn schemas but never exposes admin-only fields
(perf_fee_bps, can_quiver_operate, onboarded_by) since users see only their
own account.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.earn import EarnStrategyPreset


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
    # F-5a-3.5: risk dial. "conservative" | "balanced" | "aggressive".
    # null when has_earn_account=false (no row yet); defaults "balanced" otherwise.
    strategy_preset: str | None
    # F-5b-2: true iff Quiver auto-paused this account due to ≥4 weeks of
    # unpaid perf fee accruals. Distinguishes "Quiver paused" from "user
    # toggled off". When true, the bot-settings page shows a paused banner
    # explaining how to resume (top up wallet OR upgrade to Premium).
    dunning_pause_active: bool
    bitfinex_connected: bool
    bitfinex_funding_address: str | None  # cached deposit address

    # Tier + fee disclosure (F-4a). null when no earn_account yet — use
    # /api/earn/connect-preview to see what the user *would* get on connect.
    earn_tier: str | None  # "friend" | "public" | "internal" | "commercial"
    perf_fee_bps: int | None  # 500 = 5%, 1500 = 15%
    # Premium subscription status (F-4c). True = perf_fee skipped this period.
    is_premium: bool

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
    # F-5a-3.5: risk dial. Validated against EarnStrategyPreset enum below.
    strategy_preset: str | None = None

    @field_validator("strategy_preset")
    @classmethod
    def _validate_preset(cls, v: str | None) -> str | None:
        if v is None:
            return None
        valid = {p.value for p in EarnStrategyPreset}
        if v not in valid:
            raise ValueError(
                f"strategy_preset must be one of {sorted(valid)}, got {v!r}"
            )
        return v


class EarnSettingsOut(BaseModel):
    auto_lend_enabled: bool
    strategy_preset: str


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
    # Optional referral code (F-4b) — pasted during onboarding. If valid,
    # binds the user to the code owner as their L1 referrer. Bind failures
    # are non-fatal: connect still succeeds, error surfaced as a warning.
    referral_code: str | None = Field(default=None, min_length=4, max_length=12)

    @field_validator("bitfinex_api_key", "bitfinex_api_secret", "bitfinex_funding_address")
    @classmethod
    def _strip_whitespace(cls, v: str) -> str:
        return v.strip()

    @field_validator("referral_code")
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        return stripped if stripped else None


class EarnConnectOut(BaseModel):
    earn_account_id: int
    bitfinex_funding_address: str
    auto_lend_enabled: bool
    # Confirmation that the Bitfinex key actually works (we tested it):
    bitfinex_funding_balance: Decimal
    # Tier + fee assigned at connect time (F-4a).
    earn_tier: str
    perf_fee_bps: int
    # Referral bind result (F-4b). null if user didn't paste a code; "ok" if
    # bound; an error code (e.g. "referral.codeNotFound") if paste failed.
    # connect itself always succeeds — failed bind is a soft warning.
    referral_bind_status: str | None = None


# ─────────────────────────────────────────────────────────
# GET /api/earn/connect-preview (F-4a)
# ─────────────────────────────────────────────────────────


class EarnConnectPreviewOut(BaseModel):
    """Preview the tier + fee a user *would* get if they connect right now.

    Used by /earn/connect page to disclose the rate before the user pastes
    their Bitfinex key. If the user already has an earn_account, this echoes
    their current tier instead of pre-assigning a new one.
    """
    already_connected: bool
    tier: str  # "friend" | "public" | (or current tier if already_connected)
    perf_fee_bps: int
    perf_fee_pct: Decimal  # e.g. Decimal("5.00") for 5%
    friend_slots_total: int
    friend_slots_remaining: int


# ─────────────────────────────────────────────────────────
# GET /api/earn/performance (F-5b-1)
# ─────────────────────────────────────────────────────────


class DailyEarning(BaseModel):
    """One row of the 30-day daily earnings sparkline."""
    date: date
    usdt: Decimal


class EarnPerformanceOut(BaseModel):
    """Per-user strategy performance metrics — the 'is the bot working?' card.

    All fields are optional/nullable to handle the no-data states cleanly:
      - User just connected, no snapshots yet → totals null
      - Bitfinex API hiccup → live fields null, snapshot-derived fields still useful
    """

    # ── live: weighted APR comparison vs market ──
    current_frr_apr_pct: Decimal | None  # baseline (Bitfinex Flash Return Rate)
    weighted_avg_apr_pct: Decimal | None  # user's avg across active credits, weighted by amount
    apr_vs_frr_delta_pct: Decimal | None  # weighted_avg - current_frr (positive = beating market)

    # ── 30-day cumulative from snapshots ──
    total_interest_30d_usdt: Decimal | None  # sum of bitfinex_daily_earned over last 30d
    days_with_data: int  # count of snapshot days where daily_earned was non-null
    daily_earnings: list[DailyEarning]  # for sparkline; ordered by date asc

    # ── spike capture (live from active credits) ──
    spike_credits_count: int  # active credits with APR >= SPIKE_THRESHOLD_APY (12%)
    spike_credits_total_usdt: Decimal  # sum amount of those credits
    best_active_apr_pct: Decimal | None  # max APR among active credits

    # ── ladder visibility ──
    active_credits_count: int  # # active credits = # tranches currently lent out
    ladder_total_usdt: Decimal | None  # sum amount across all active credits


# ─────────────────────────────────────────────────────────
# GET /api/earn/public-stats (F-5b-1) — no auth required
# ─────────────────────────────────────────────────────────


class EarnPublicStatsOut(BaseModel):
    """Aggregate platform-wide stats for marketing / social proof.

    Safe to expose unauthenticated — only counts and totals, no PII.
    Cached server-side ~60s to absorb scraper traffic.
    """
    active_bots_count: int  # distinct earn_accounts with at least one lent position
    total_lent_usdt: Decimal  # sum of latest-snapshot lent across all accounts
    avg_apr_30d_pct: Decimal | None  # platform-weighted avg APR over last 30d snapshots


# ─────────────────────────────────────────────────────────
# GET /api/earn/fees (F-5b-2) — perf fee accrual + payment status
# ─────────────────────────────────────────────────────────


class FeeAccrualRow(BaseModel):
    """One historical accrual row for the user-facing fee history table."""
    id: int
    period_start: date
    period_end: date
    earnings_amount: Decimal
    fee_bps_applied: int
    fee_amount: Decimal
    status: str  # ACCRUED | PAID | WAIVED
    paid_at: datetime | None
    paid_method: str | None  # platform_deduction | tron_usdt | manual_offline


class EarnFeeSummaryOut(BaseModel):
    """User-facing perf fee dashboard.

    Solves the structural visibility gap of self-custody Path A: the user's
    USDT lives on Bitfinex (out of Quiver's reach), so we settle perf fees
    by deducting from the user's Quiver wallet balance every Monday. If the
    wallet is empty (typical right after auto-lend), accruals pile up
    silently — this card surfaces "you owe X, your buffer is Y, top up to
    avoid arrears" before users get confused.

    Returned even for fee-exempt users (Friend tier, Premium subscribers)
    so the client can render an "exempt" pill rather than 404; client
    decides whether to show the full table.
    """
    # ── policy ──
    perf_fee_bps: int  # 0 = exempt (Friend / Premium overrides)
    is_premium: bool   # if true, perf fee is waived this period regardless of bps

    # ── what user owes right now ──
    pending_accrued_usdt: Decimal  # sum of ACCRUED rows
    pending_count: int             # how many ACCRUED rows
    quiver_wallet_balance_usdt: Decimal  # user's spendable Quiver wallet
    has_buffer_warning: bool       # pending > balance (will be in arrears next settle)

    # ── F-5b-2 dunning state ──
    # "ok"      → 0-1 unpaid weeks
    # "warning" → 2-3 unpaid weeks (visible nudge but no action)
    # "paused"  → >=4 unpaid weeks; Quiver auto-paused auto_lend
    dunning_level: str
    dunning_pause_active: bool  # mirror of EarnAccount.dunning_pause_active

    # ── what user has paid historically ──
    paid_30d_usdt: Decimal
    paid_lifetime_usdt: Decimal
    last_paid_at: datetime | None

    # ── next settlement attempt ──
    # cron runs Monday 02:00 UTC per services/earn/perf_fee.py
    next_settle_at: datetime

    # ── recent rows for transparency table ──
    recent_accruals: list[FeeAccrualRow]
