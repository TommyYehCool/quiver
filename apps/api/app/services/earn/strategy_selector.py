"""Smart strategy selector — F-5a-3.10b.

Replaces the F-5a-3.7 logic of "base tranche = FRR market order, higher
tranches = FRR × multiplier" with a *period-aware market-clearing*
strategy. The pre-F-5a-3.10 code committed two simplifying assumptions:

  1. FRR is a fair price for the base tranche.
     False when the term structure is steep (today: FRR 8.7% APR, 2-day
     clearing 4.4% APR — borrowers route to fixed offers at 4.4% first
     and the FRR queue waits).

  2. Period selection is a function of *rate alone* via _select_period_days.
     False when 2-day liquidity is huge but 30-day liquidity is thin —
     we should follow the volume, not just the rate.

F-5a-3.10 fixes both by reasoning over per-period market signals
(see market_signals.py) and producing a richer StrategyDecision that
also surfaces *why* each tranche was chosen (used by the dry-run
preview UI).

Public API
==========
- select_strategy(amount, preset, signals, frr) → StrategyDecision
  Pure function — no I/O. Caller fetches signals + FRR, passes them in.
  Lets the dry-run endpoint, the auto_lend dispatcher, and unit tests
  share the same function with no wrapping needed.

- to_legacy_ladder(decision) → list[tuple[Decimal, Decimal|None, int]]
  Adapter for the existing _submit_ladder caller signature. Keeps the
  blast radius of this commit small — auto_lend.py changes one line.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal

from app.core.logging import get_logger
from app.models.earn import EarnStrategyPreset
from app.services.earn.market_signals import (
    CANONICAL_PERIODS,
    MarketSignals,
    PeriodSignal,
)

logger = get_logger(__name__)

# Bitfinex platform minimum per offer. Tranches below this are merged or
# the whole strategy collapses to a single tranche.
MIN_OFFER_USDT = Decimal("150")

# Threshold below which we don't ladder — would slice into sub-150 tranches
# that violate Bitfinex's per-offer minimum. Aligned with F-5a-3.3 logic.
LADDER_FLOOR_USDT = Decimal("1875")

# Premium added on top of market-clearing median to win price-time priority
# without giving away yield. 1% multiplicative is small enough to keep us
# competitive but ensures we're not exactly tied with a hundred other offers.
MARKET_CLEARING_PREMIUM = Decimal("1.01")

# Aggressive preset's hard cap on rate, expressed as multiplier of FRR.
# Above this borrowers won't bite — they'd take FRR offers instead.
# Picked at FRR × 1.3 per F-5a-3.10 spec.
AGGRESSIVE_RATE_CEILING_MULT = Decimal("1.3")

# Fallback period when signals are unavailable for ALL canonical periods.
# Match the legacy DEFAULT_OFFER_PERIOD_DAYS (= 2).
FALLBACK_PERIOD_DAYS = 2


@dataclass(frozen=True)
class StrategyTranche:
    """One offer to submit. rate_daily=None → FRR market order."""

    amount: Decimal
    rate_daily: Decimal | None
    period_days: int
    reasoning: str  # human-readable explanation for the dry-run UI


@dataclass(frozen=True)
class StrategyDecision:
    """Output of the strategy selector + provenance for transparency."""

    preset: str
    total_amount: Decimal
    tranches: tuple[StrategyTranche, ...]
    notes: tuple[str, ...]    # anything noteworthy (fallback reasons, etc.)
    fallback_used: bool       # True if any tranche fell back to FRR

    @property
    def total_apr_estimate_pct(self) -> Decimal:
        """Weighted-avg expected APR across tranches. None-rate tranches
        contribute 0 to the avg (we don't know what they'll fill at).
        Useful for the dry-run UI's headline number."""
        total = self.total_amount
        if total == 0:
            return Decimal(0)
        weighted = Decimal(0)
        for t in self.tranches:
            if t.rate_daily is None:
                continue
            apr = t.rate_daily * Decimal(365) * Decimal(100)
            weighted += apr * (t.amount / total)
        return weighted.quantize(Decimal("0.01"))


# ─────────────────────────────────────────────────────────
# Period scoring
# ─────────────────────────────────────────────────────────


def _score_period(
    sig: PeriodSignal,
    preset: str,
) -> Decimal:
    """Composite score balancing yield × liquidity × preset-specific bias.

    Higher = more attractive. The selector picks the top-N periods by score.

    Components:
      yield_term     = median rate (we want high)
      liquidity_term = √(30-min volume) (we want fillable; sqrt damps so
                       a 100x volume difference doesn't completely dominate)
      preset_weight  = preset-specific period preference

    Periods with no signal score 0 (selector skips them).
    """
    if not sig.has_signal or sig.median_rate_daily <= 0:
        return Decimal(0)

    yield_term = sig.median_rate_daily
    # sqrt for damping; convert to float because Decimal has no sqrt.
    liquidity_term = Decimal(str(math.sqrt(max(float(sig.volume_30min_usdt), 1.0))))
    preset_weight = _preset_period_weight(sig.period_days, preset)

    return yield_term * liquidity_term * preset_weight


def _preset_period_weight(period_days: int, preset: str) -> Decimal:
    """Per-preset bias toward short vs long periods.

    Conservative wants fast fill + reprice → bias short.
    Aggressive wants to capture spike rates + long lock → bias long.
    Balanced is flat across periods.
    """
    if preset == EarnStrategyPreset.CONSERVATIVE.value:
        # Bias short: 2d=1.0, 7d=0.7, 14d=0.5, 30d=0.3
        weights = {2: Decimal("1.0"), 7: Decimal("0.7"), 14: Decimal("0.5"), 30: Decimal("0.3")}
    elif preset == EarnStrategyPreset.AGGRESSIVE.value:
        # Bias long: 2d=0.4, 7d=0.7, 14d=0.9, 30d=1.0
        weights = {2: Decimal("0.4"), 7: Decimal("0.7"), 14: Decimal("0.9"), 30: Decimal("1.0")}
    else:
        # Balanced: flat
        weights = {p: Decimal("1.0") for p in CANONICAL_PERIODS}
    return weights.get(period_days, Decimal("0.5"))


# ─────────────────────────────────────────────────────────
# Per-tranche rate computation
# ─────────────────────────────────────────────────────────


def _market_clearing_rate(sig: PeriodSignal, frr_daily: Decimal | None) -> Decimal | None:
    """The rate that wins price-time priority at THIS period.

    = market_median × MARKET_CLEARING_PREMIUM    (FRR is intentionally NOT a floor)

    Why FRR is not used as a floor (F-5a-3.10 design decision):
      FRR is a cross-period weighted average. Today's snapshot:
        2-day clearing  4.4% APR
        30-day clearing 7.8% APR
        FRR             8.7% APR (steep term structure pulls the avg up)
      Borrowers picking 2-day funding compare against 2-day offers, NOT
      FRR. Pinning our 2-day offer at FRR (8.7%) makes it overpriced for
      its actual market and leaves it unfilled. The post-F-5a-3.7 prod
      data confirmed this — Tommy's $200 FRR-mode 2d offer sat unfilled
      for 1.5h while 2d trades cleared at 4.3-4.4%.

      The right anchor is the per-period clearing rate. FRR's role moves
      to: (a) the AGGRESSIVE preset's spike-tranche ceiling, (b) the
      fallback when no per-period signal exists at all.

    Returns None if the signal is too weak to anchor a fixed rate.
    """
    # frr_daily intentionally unused here — see docstring for rationale.
    del frr_daily
    if not sig.has_signal or sig.median_rate_daily <= 0:
        return None
    return sig.median_rate_daily * MARKET_CLEARING_PREMIUM


def _spike_premium_rate(
    base_rate: Decimal,
    multiplier: Decimal,
    preset: str,
    frr_daily: Decimal | None,
) -> Decimal:
    """Rate for a spike-capture tranche (multiplier > 1.0).

    For aggressive preset, capped at FRR × AGGRESSIVE_RATE_CEILING_MULT
    so we don't post unfillable offers. For others, just multiplied.
    """
    raw = base_rate * multiplier
    if preset == EarnStrategyPreset.AGGRESSIVE.value and frr_daily is not None:
        ceiling = frr_daily * AGGRESSIVE_RATE_CEILING_MULT
        if raw > ceiling:
            return ceiling
    return raw


# ─────────────────────────────────────────────────────────
# Strategy templates
# ─────────────────────────────────────────────────────────
# Each template is a list of (fraction, rate_multiplier) — same shape as
# F-5a-3.5 ladder tables. F-5a-3.10 keeps the multiplier semantics for
# the spike-capture tranches but anchors them on market_clearing instead
# of FRR (so a 1.2× tranche means "20% above market median", not
# "20% above FRR cross-period weighted").

LADDER_CONSERVATIVE: list[tuple[Decimal, Decimal]] = [
    (Decimal("0.85"), Decimal("1.00")),  # base: market-clearing
    (Decimal("0.15"), Decimal("1.20")),  # mild spike-capture
]
LADDER_BALANCED: list[tuple[Decimal, Decimal]] = [
    (Decimal("0.60"), Decimal("1.00")),
    (Decimal("0.20"), Decimal("1.20")),
    (Decimal("0.10"), Decimal("1.50")),
    (Decimal("0.07"), Decimal("2.00")),
    (Decimal("0.03"), Decimal("3.00")),
]
LADDER_AGGRESSIVE: list[tuple[Decimal, Decimal]] = [
    (Decimal("0.40"), Decimal("1.00")),
    (Decimal("0.25"), Decimal("1.10")),
    (Decimal("0.20"), Decimal("1.20")),
    (Decimal("0.15"), Decimal("1.30")),  # capped at AGGRESSIVE_RATE_CEILING_MULT
]


def _ladder_template(preset: str) -> list[tuple[Decimal, Decimal]]:
    if preset == EarnStrategyPreset.CONSERVATIVE.value:
        return LADDER_CONSERVATIVE
    if preset == EarnStrategyPreset.AGGRESSIVE.value:
        return LADDER_AGGRESSIVE
    return LADDER_BALANCED


# ─────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────


def select_strategy(
    amount: Decimal,
    preset: str,
    signals: MarketSignals,
    frr_daily: Decimal | None,
) -> StrategyDecision:
    """Pure function: given amount + preset + market state, return the
    StrategyDecision. No I/O — caller assembles inputs.

    Algorithm:
      1. Score each canonical period; pick the highest-scoring one as the
         "primary" period for the bulk of the bulk-tranche.
      2. If amount < LADDER_FLOOR_USDT → single tranche at primary period
         with rate = market_clearing(primary) (or FRR fallback).
      3. Otherwise build the ladder template; place the base tranche at
         the primary period and successive tranches at progressively
         longer periods (so spike tranches lock in their elevated rate).
    """
    notes: list[str] = []
    fallback_used = False

    # Step 1: score and rank periods
    scored = [
        (p, _score_period(signals.by_period[p], preset))
        for p in CANONICAL_PERIODS
        if p in signals.by_period
    ]
    scored.sort(key=lambda x: x[1], reverse=True)

    # Identify viable periods (those with signal); fallback if none
    viable = [p for p, score in scored if score > 0]
    if not viable:
        notes.append(
            "no period has sufficient signal; falling back to FRR market order at 2d"
        )
        fallback_used = True
        return StrategyDecision(
            preset=preset,
            total_amount=amount,
            tranches=(
                StrategyTranche(
                    amount=amount,
                    rate_daily=None,
                    period_days=FALLBACK_PERIOD_DAYS,
                    reasoning="fallback: no market signal available, using FRR market order",
                ),
            ),
            notes=tuple(notes),
            fallback_used=True,
        )

    primary_period = viable[0]
    primary_sig = signals.by_period[primary_period]
    primary_rate = _market_clearing_rate(primary_sig, frr_daily)

    if primary_rate is None:
        notes.append(
            f"period {primary_period}d had insufficient signal post-scoring "
            f"(score>0 but rate calc failed); falling back to FRR market"
        )
        fallback_used = True
        return StrategyDecision(
            preset=preset,
            total_amount=amount,
            tranches=(
                StrategyTranche(
                    amount=amount,
                    rate_daily=None,
                    period_days=primary_period,
                    reasoning=f"fallback: period {primary_period}d signal degraded",
                ),
            ),
            notes=tuple(notes),
            fallback_used=True,
        )

    # Step 2: small amount → single tranche
    if amount < LADDER_FLOOR_USDT:
        notes.append(
            f"amount ${amount} < ${LADDER_FLOOR_USDT} ladder floor; single tranche"
        )
        rate_apr = primary_rate * Decimal(365) * Decimal(100)
        median_apr = primary_sig.median_apr_pct
        return StrategyDecision(
            preset=preset,
            total_amount=amount,
            tranches=(
                StrategyTranche(
                    amount=amount,
                    rate_daily=primary_rate,
                    period_days=primary_period,
                    reasoning=(
                        f"single tranche at {primary_period}d, rate {rate_apr:.2f}% APR "
                        f"(median {median_apr:.2f}% × 1.01 premium)"
                    ),
                ),
            ),
            notes=tuple(notes),
            fallback_used=False,
        )

    # Step 3: ladder. Base tranche at primary_period; spike tranches at
    # progressively longer periods (locking in elevated rate for longer).
    template = _ladder_template(preset)
    period_assignments = _assign_periods_to_tranches(
        len(template), viable, primary_period
    )

    tranches: list[StrategyTranche] = []
    cumulative = Decimal(0)
    for i, ((frac, mult), period) in enumerate(zip(template, period_assignments)):
        # Last tranche absorbs rounding to ensure exact total
        if i == len(template) - 1:
            chunk = amount - cumulative
        else:
            chunk = (amount * frac).quantize(Decimal("0.01"))
            cumulative += chunk

        if chunk < MIN_OFFER_USDT:
            # Tranche too small for Bitfinex platform minimum; merge into base
            notes.append(
                f"tranche {i} ${chunk} < ${MIN_OFFER_USDT}; merging into base"
            )
            if tranches:
                base = tranches[0]
                tranches[0] = StrategyTranche(
                    amount=base.amount + chunk,
                    rate_daily=base.rate_daily,
                    period_days=base.period_days,
                    reasoning=base.reasoning + f" (+${chunk} merged from sub-min tranche {i})",
                )
            continue

        if mult == Decimal("1.00"):
            rate = primary_rate
            apr = rate * Decimal(365) * Decimal(100)
            reasoning = (
                f"base tranche at {period}d, rate {apr:.2f}% APR "
                f"(market median × 1.01 premium)"
            )
        else:
            # Spike-capture tranche: anchored on market_clearing × multiplier,
            # capped per preset rules.
            rate = _spike_premium_rate(primary_rate, mult, preset, frr_daily)
            apr = rate * Decimal(365) * Decimal(100)
            reasoning = (
                f"spike tranche at {period}d, {mult}× base = {apr:.2f}% APR"
            )
            if (
                preset == EarnStrategyPreset.AGGRESSIVE.value
                and frr_daily is not None
                and rate == frr_daily * AGGRESSIVE_RATE_CEILING_MULT
            ):
                reasoning += f" (capped at FRR × {AGGRESSIVE_RATE_CEILING_MULT})"

        tranches.append(
            StrategyTranche(
                amount=chunk,
                rate_daily=rate,
                period_days=period,
                reasoning=reasoning,
            )
        )

    return StrategyDecision(
        preset=preset,
        total_amount=amount,
        tranches=tuple(tranches),
        notes=tuple(notes),
        fallback_used=fallback_used,
    )


def _assign_periods_to_tranches(
    n_tranches: int,
    viable_periods: list[int],
    primary_period: int,
) -> list[int]:
    """Map each tranche slot to a period.

    Strategy:
      - Base tranche (slot 0) at primary period (most liquid)
      - Spike tranches at progressively LONGER periods to lock in elevated
        rates if they fill (high-rate spike at 30d > high-rate spike at 2d
        in dollar terms)
      - Walk through viable_periods in ascending order from primary, wrapping
        if needed
    """
    # Start at primary period for base; for spikes, walk to longer periods
    # in viable list. If primary is already 30d, repeat 30d for all spikes.
    sorted_viable = sorted(set(viable_periods))
    primary_idx = sorted_viable.index(primary_period)
    out: list[int] = [primary_period]
    for slot in range(1, n_tranches):
        # Next slot goes to the next-longer viable period, capped at the
        # longest viable
        target_idx = min(primary_idx + slot, len(sorted_viable) - 1)
        out.append(sorted_viable[target_idx])
    return out


def to_legacy_ladder(
    decision: StrategyDecision,
) -> list[tuple[Decimal, Decimal | None, int]]:
    """Adapter for callers that take the (amount, rate, period) tuple list.

    Used by auto_lend._submit_ladder so the F-5a-3.10 strategy plugs in
    without rewriting the submission code.
    """
    return [(t.amount, t.rate_daily, t.period_days) for t in decision.tranches]
