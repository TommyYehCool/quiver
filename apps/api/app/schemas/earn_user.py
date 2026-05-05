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


class CancelOfferIn(BaseModel):
    """Body for POST /api/earn/me/cancel-offer.

    Cancels a single Bitfinex funding offer by id. Caller's API key must own
    the offer (Bitfinex enforces this — wrong-account cancel returns ERROR).
    """
    offer_id: int = Field(..., description="Bitfinex offer id to cancel")


class SubmitOfferIn(BaseModel):
    """Body for POST /api/earn/me/submit-offer.

    Submits a fresh funding offer at user-specified parameters. When rate_daily
    is null, posts as an FRR market order (auto-tracks FRR until matched).
    Otherwise posts as a fixed-rate offer.

    Validation mirrors Bitfinex platform limits:
      amount     ≥ 50 USDT (Bitfinex minimum funding offer)
      rate_daily 0 < rate ≤ 0.05 (= up to ~1825% APR, let users be silly)
      period     2-30 days (Bitfinex platform range)
    """
    amount: Decimal = Field(..., gt=0, description="Offer amount in USDT")
    rate_daily: Decimal | None = Field(
        None,
        description="Daily rate (0.0001 = 0.01%/d ≈ 3.65% APR). Null = FRR market.",
    )
    period_days: int = Field(..., ge=2, le=30, description="Lock period (days)")

    @field_validator("amount")
    @classmethod
    def _validate_amount(cls, v: Decimal) -> Decimal:
        if v < Decimal("50"):
            raise ValueError("amount must be ≥ 50 USDT (Bitfinex minimum)")
        return v

    @field_validator("rate_daily")
    @classmethod
    def _validate_rate(cls, v: Decimal | None) -> Decimal | None:
        if v is None:
            return v
        if v <= 0 or v > Decimal("0.05"):
            raise ValueError("rate_daily must be in (0, 0.05] when specified")
        return v


class SubmitOfferOut(BaseModel):
    offer_id: int


class CancelOfferOut(BaseModel):
    offer_id: int
    cancelled: bool


# ─────────────────────────────────────────────────────────
# F-5a-3.10d: dry-run strategy preview
# ─────────────────────────────────────────────────────────


class StrategyPreviewIn(BaseModel):
    """Body for POST /api/earn/strategy-preview.

    Lets the user see what the F-5a-3.10 strategy_selector WOULD do under
    the current market signals + their preset, without actually submitting
    an offer. UI calls this on demand (button or auto-refresh) to surface
    the strategy + reasoning.

    All fields optional — defaults read from the user's account:
      preset = user's current strategy_preset
      amount = current funding_available + sum(pending_offers) (= total
               capital that would be deployed if reconcile fired now)
    """
    preset: str | None = Field(
        None,
        description="Override preset (conservative/balanced/aggressive). "
                    "Null = use user's current preset.",
    )
    amount: Decimal | None = Field(
        None,
        gt=0,
        description="Override amount in USDT. Null = use user's actual "
                    "deployable capital.",
    )

    @field_validator("preset")
    @classmethod
    def _validate_preset(cls, v: str | None) -> str | None:
        if v is None:
            return v
        valid = {"conservative", "balanced", "aggressive"}
        if v not in valid:
            raise ValueError(f"preset must be one of {valid}")
        return v


class PeriodSignalOut(BaseModel):
    """Per-period market signal exposed to UI for transparency."""
    period_days: int
    has_signal: bool
    median_apr_pct: Decimal
    volume_30min_usdt: Decimal
    trade_count_30min: int


class StrategyTrancheOut(BaseModel):
    amount: Decimal
    rate_daily: Decimal | None    # null = FRR market order
    period_days: int
    apr_pct: Decimal | None       # rate_daily annualised, null when FRR
    reasoning: str


class StrategyPreviewOut(BaseModel):
    """What select_strategy() would produce + provenance for the UI."""
    preset: str
    amount: Decimal
    frr_apr_pct: Decimal | None
    tranches: list[StrategyTrancheOut]
    avg_apr_pct: Decimal           # weighted-avg expected APR
    fallback_used: bool
    notes: list[str]
    signals: list[PeriodSignalOut]


class PendingOfferOut(BaseModel):
    """Live snapshot of one pending funding offer (= money waiting to be matched).

    Distinguished from ActiveCreditOut: an offer is submitted but not yet matched
    by a borrower. Funds are reserved in the funding wallet (so wallet.available
    drops) but no interest accrues yet.

    rate_daily=0 indicates an FRR market order (rate=None at submit time);
    Bitfinex stores rate type as FRR and the actual fill rate is determined at
    match time.
    """
    id: int                          # offer id (for cancel / amend)
    amount: Decimal                  # remaining unmatched amount (USDT)
    rate_daily: Decimal              # 0 = FRR market order; >0 = fixed-rate offer
    is_frr: bool                     # True if FRR market order (rate=0 sentinel)
    period_days: int


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
    # F-5a-4.1: telegram bot binding state. UI hides the connect card when
    # bot_username is null (= bot not configured server-side yet).
    telegram_bound: bool
    telegram_bot_username: str | None
    # F-5a-4.1.1: cached TG username (e.g., "TommyYeh") so the bound state
    # can render @TommyYeh without an extra round-trip. Null when not bound
    # OR when the user has no @username on Telegram side.
    telegram_username: str | None
    # F-5a-4.3: leaderboard opt-in. Drives the toggle on bot-settings.
    show_on_leaderboard: bool
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

    # Live pending offers at Bitfinex (submitted but not yet matched).
    # When non-empty, wallet.available is depleted by the sum of these amounts
    # (Bitfinex reserves funds for unmatched offers). UI surfaces these in a
    # dedicated card so users see "submitted but not earning yet" capital.
    pending_offers: list[PendingOfferOut]

    # Sum of pending_offers.amount — convenience for the big-number card.
    # 0 (not None) when no pending offers, so UI never renders "—" here.
    pending_offers_total_usdt: Decimal

    # Trend (last N days)
    recent_snapshots: list[EarnSnapshotUserOut]


# ─────────────────────────────────────────────────────────
# PATCH /api/earn/settings
# ─────────────────────────────────────────────────────────


class EarnSettingsUpdateIn(BaseModel):
    auto_lend_enabled: bool | None = None
    # F-5a-3.5: risk dial. Validated against EarnStrategyPreset enum below.
    strategy_preset: str | None = None
    # F-5a-4.3: opt-in for /rank leaderboard (stored on User, not EarnAccount).
    show_on_leaderboard: bool | None = None

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
    show_on_leaderboard: bool


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


# ─────────────────────────────────────────────────────────
# GET /api/earn/rank (F-5a-4.3) — public leaderboard, no auth
# ─────────────────────────────────────────────────────────


class RankEntryOut(BaseModel):
    """One row of the public leaderboard.

    `display_name` is the only identity surface — either "@username" (if
    user opted in AND has Telegram bound) or "Anonymous #XXXX" (stable
    SHA-256 hash of user_id, 4 hex chars). We deliberately don't expose
    total_lent_usdt or any wealth signal — pure performance.
    """
    rank: int
    display_name: str
    is_anonymous: bool  # for UI styling (anonymous gets muted color)
    apr_30d_pct: Decimal
    days_active: int
    is_premium: bool


class EarnRankOut(BaseModel):
    """Public leaderboard payload — cached server-side ~60s."""
    entries: list[RankEntryOut]
    total_qualified_count: int  # users meeting min_days threshold (may exceed limit)
    min_days_threshold: int     # exposed for the page's "to qualify" copy
    last_updated_at: datetime
