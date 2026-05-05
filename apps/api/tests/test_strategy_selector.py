"""Pure-function tests for strategy_selector (F-5a-3.10b).

Tests the period-aware strategy selector with synthetic MarketSignals.
No I/O, no database, no clock — we control the inputs entirely.

What we cover:
  - Fallback chain: no signals → FRR market order at 2d
  - Single-tranche path (amount < ladder floor)
  - Ladder path (amount >= ladder floor) with all 3 presets
  - Per-period scoring picks the highest-volume × highest-rate period
  - Aggressive preset's FRR × 1.3 ceiling on spike tranches
  - Tranche merging when sub-min-offer slices result
  - to_legacy_ladder adapter shape
"""

from __future__ import annotations

import time
from decimal import Decimal

import pytest

from app.models.earn import EarnStrategyPreset
from app.services.earn.market_signals import (
    CANONICAL_PERIODS,
    MarketSignals,
    PeriodSignal,
)
from app.services.earn.strategy_selector import (
    AGGRESSIVE_RATE_CEILING_MULT,
    LADDER_BALANCED,
    LADDER_FLOOR_USDT,
    MARKET_CLEARING_PREMIUM,
    select_strategy,
    to_legacy_ladder,
)


# ─────────────────────────────────────────────────────────
# Helpers — synthetic signals
# ─────────────────────────────────────────────────────────


def _sig(
    period: int,
    median_apr: float,
    volume: float,
    has_signal: bool = True,
) -> PeriodSignal:
    """Build a PeriodSignal from human-friendly numbers."""
    median_daily = Decimal(str(median_apr / 36500.0))
    return PeriodSignal(
        period_days=period,
        has_signal=has_signal,
        median_rate_daily=median_daily if has_signal else Decimal(0),
        volume_30min_usdt=Decimal(str(volume)),
        trade_count_30min=20 if has_signal else 0,
        top_ask_rate_daily=median_daily,
        top_ask_amount_usdt=Decimal(str(volume / 4)),
    )


def _empty_signals() -> MarketSignals:
    """All canonical periods have has_signal=False."""
    by_period = {p: _sig(p, 0, 0, has_signal=False) for p in CANONICAL_PERIODS}
    return MarketSignals(fetched_at_ms=int(time.time() * 1000), by_period=by_period)


def _signals_2d_dominant() -> MarketSignals:
    """2-day has highest volume + reasonable rate. Models today's market."""
    by_period = {
        2: _sig(2, median_apr=4.4, volume=92_000),
        7: _sig(7, median_apr=5.2, volume=8_000),
        14: _sig(14, median_apr=6.1, volume=3_000),
        30: _sig(30, median_apr=7.8, volume=1_000),
    }
    return MarketSignals(fetched_at_ms=int(time.time() * 1000), by_period=by_period)


def _signals_30d_dominant() -> MarketSignals:
    """30-day has best rate AND high volume — favours long-period strategies."""
    by_period = {
        2: _sig(2, median_apr=3.0, volume=2_000),
        7: _sig(7, median_apr=5.0, volume=3_000),
        14: _sig(14, median_apr=7.0, volume=5_000),
        30: _sig(30, median_apr=10.0, volume=80_000),
    }
    return MarketSignals(fetched_at_ms=int(time.time() * 1000), by_period=by_period)


# ─────────────────────────────────────────────────────────
# Fallback chain
# ─────────────────────────────────────────────────────────


def test_no_signals_falls_back_to_frr_market_at_2d():
    decision = select_strategy(
        amount=Decimal("200"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_empty_signals(),
        frr_daily=Decimal("0.00024"),
    )
    assert decision.fallback_used is True
    assert len(decision.tranches) == 1
    assert decision.tranches[0].rate_daily is None
    assert decision.tranches[0].period_days == 2
    assert "no period has sufficient signal" in " ".join(decision.notes)


def test_no_signals_no_frr_still_returns_decision():
    """Pathological case — defaults all the way to None rate / 2d."""
    decision = select_strategy(
        amount=Decimal("500"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_empty_signals(),
        frr_daily=None,
    )
    assert decision.fallback_used is True
    assert decision.tranches[0].rate_daily is None


# ─────────────────────────────────────────────────────────
# Single-tranche path (amount < ladder floor)
# ─────────────────────────────────────────────────────────


def test_small_amount_single_tranche_2d_dominant_market():
    """Tommy's $200 case: 2d dominant → single tranche at 2d, market-clearing.

    Critical: FRR is NOT used as a floor (see _market_clearing_rate docstring).
    Today's prod conditions had FRR=8.72% APR but 2d clearing=4.31% APR; pinning
    at FRR was the bug F-5a-3.10 specifically fixes."""
    decision = select_strategy(
        amount=Decimal("200"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_signals_2d_dominant(),
        frr_daily=Decimal("0.00024"),  # 8.76% APR — far above 2d 4.4%, must NOT pin here
    )
    assert decision.fallback_used is False
    assert len(decision.tranches) == 1
    t = decision.tranches[0]
    assert t.amount == Decimal("200")
    assert t.period_days == 2
    # Rate = 2d market median × premium (4.4% × 1.01), FRR does NOT lift it
    expected = Decimal(str(4.4 / 36500)) * MARKET_CLEARING_PREMIUM
    assert t.rate_daily == expected
    # And the resulting APR must be near 4.4%, not near FRR's 8.76%
    assert t.rate_daily * Decimal(365) * Decimal(100) < Decimal("5.0")


def test_small_amount_single_tranche_no_frr_uses_market_premium():
    decision = select_strategy(
        amount=Decimal("500"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_signals_2d_dominant(),
        frr_daily=None,
    )
    t = decision.tranches[0]
    assert t.period_days == 2
    expected = Decimal(str(4.4 / 36500)) * MARKET_CLEARING_PREMIUM
    assert t.rate_daily == expected


def test_just_below_ladder_floor_is_single_tranche():
    decision = select_strategy(
        amount=LADDER_FLOOR_USDT - Decimal("1"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_signals_2d_dominant(),
        frr_daily=Decimal("0.00010"),
    )
    assert len(decision.tranches) == 1


# ─────────────────────────────────────────────────────────
# Ladder path
# ─────────────────────────────────────────────────────────


def test_ladder_amount_balanced_produces_5_tranches():
    decision = select_strategy(
        amount=Decimal("10000"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_signals_2d_dominant(),
        frr_daily=Decimal("0.00024"),
    )
    assert decision.fallback_used is False
    assert len(decision.tranches) == len(LADDER_BALANCED)
    # Tranche fractions sum to total
    total = sum((t.amount for t in decision.tranches), Decimal(0))
    assert total == Decimal("10000")


def test_ladder_balanced_base_at_primary_period_spikes_at_longer():
    decision = select_strategy(
        amount=Decimal("10000"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_signals_2d_dominant(),  # primary = 2d
        frr_daily=Decimal("0.00024"),
    )
    # First tranche is the base (primary period)
    assert decision.tranches[0].period_days == 2
    # Subsequent tranches walk to longer periods
    periods = [t.period_days for t in decision.tranches]
    # Periods should be non-decreasing
    assert periods == sorted(periods)


def test_ladder_30d_dominant_market_picks_30d_as_primary():
    decision = select_strategy(
        amount=Decimal("10000"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_signals_30d_dominant(),
        frr_daily=Decimal("0.00020"),
    )
    assert decision.tranches[0].period_days == 30


# ─────────────────────────────────────────────────────────
# Preset bias
# ─────────────────────────────────────────────────────────


def test_conservative_prefers_short_period():
    """Conservative bias (period weight) makes 2d win even when 30d has
    similar median rate, because the weight tilts toward 2d."""
    # Roughly equal rates and volumes; bias should pick 2d
    by_period = {
        2: _sig(2, median_apr=5.0, volume=50_000),
        7: _sig(7, median_apr=5.0, volume=50_000),
        14: _sig(14, median_apr=5.0, volume=50_000),
        30: _sig(30, median_apr=5.0, volume=50_000),
    }
    sigs = MarketSignals(fetched_at_ms=int(time.time() * 1000), by_period=by_period)
    decision = select_strategy(
        amount=Decimal("500"),
        preset=EarnStrategyPreset.CONSERVATIVE.value,
        signals=sigs,
        frr_daily=Decimal("0.00014"),
    )
    assert decision.tranches[0].period_days == 2


def test_aggressive_prefers_long_period_when_rates_equal():
    by_period = {
        2: _sig(2, median_apr=5.0, volume=50_000),
        7: _sig(7, median_apr=5.0, volume=50_000),
        14: _sig(14, median_apr=5.0, volume=50_000),
        30: _sig(30, median_apr=5.0, volume=50_000),
    }
    sigs = MarketSignals(fetched_at_ms=int(time.time() * 1000), by_period=by_period)
    decision = select_strategy(
        amount=Decimal("500"),
        preset=EarnStrategyPreset.AGGRESSIVE.value,
        signals=sigs,
        frr_daily=Decimal("0.00014"),
    )
    assert decision.tranches[0].period_days == 30


# ─────────────────────────────────────────────────────────
# Aggressive ceiling
# ─────────────────────────────────────────────────────────


def test_aggressive_spike_tranche_capped_at_frr_x_ceiling():
    """The highest-multiplier tranche (6×) on a hot market would yield
    a literally-unfillable rate. Aggressive caps it at FRR × CEILING.

    F-5a-3.10.1 raised the ceiling to 5.0 (was 1.3) so the spike-capture
    tranches can actually reach reasonable spike rates instead of being
    flattened to FRR × 1.3.
    """
    # market_clearing computed from this signal would be high
    by_period = {
        2: _sig(2, median_apr=20.0, volume=100_000),  # very hot 2d market
        7: _sig(7, median_apr=15.0, volume=20_000),
        14: _sig(14, median_apr=12.0, volume=10_000),
        30: _sig(30, median_apr=10.0, volume=5_000),
    }
    sigs = MarketSignals(fetched_at_ms=int(time.time() * 1000), by_period=by_period)
    frr = Decimal(str(8.0 / 36500))  # 8% APR
    decision = select_strategy(
        amount=Decimal("10000"),
        preset=EarnStrategyPreset.AGGRESSIVE.value,
        signals=sigs,
        frr_daily=frr,
    )
    # Last tranche has the highest multiplier — verify it's capped
    last = decision.tranches[-1]
    expected_ceiling = frr * AGGRESSIVE_RATE_CEILING_MULT
    assert last.rate_daily is not None
    assert last.rate_daily <= expected_ceiling + Decimal("1e-9")
    # Sanity: the cap should actually be bigger than market × 1.0 — otherwise
    # the cap would be silently flattening the base tranche too. F-5a-3.10.1
    # cap (5×) at FRR 8% = 40% APR > 2d clearing 20% APR, so OK.
    base_rate = decision.tranches[0].rate_daily
    assert base_rate is not None
    assert base_rate < expected_ceiling


def test_aggressive_has_six_tranches_with_progressive_multipliers():
    """F-5a-3.10.1: aggressive ladder widened from 4 to 6 tranches with
    multipliers 1.0/1.3/1.8/2.5/4.0/6.0. Confirms shape + monotonicity."""
    decision = select_strategy(
        amount=Decimal("10000"),
        preset=EarnStrategyPreset.AGGRESSIVE.value,
        signals=_signals_2d_dominant(),
        frr_daily=Decimal(str(8.0 / 36500)),  # 8% APR FRR, plenty of cap headroom
    )
    assert len(decision.tranches) == 6
    # Rates should be strictly increasing across tranches (the whole point
    # of the ladder shape — bulk at base, premiums staircase up)
    rates = [t.rate_daily for t in decision.tranches]
    for r in rates:
        assert r is not None  # aggressive never uses FRR-market None tranches
    for i in range(1, len(rates)):
        assert rates[i] > rates[i - 1]


# ─────────────────────────────────────────────────────────
# Adapter
# ─────────────────────────────────────────────────────────


def test_to_legacy_ladder_shape_matches_submit_ladder_expected_input():
    decision = select_strategy(
        amount=Decimal("10000"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_signals_2d_dominant(),
        frr_daily=Decimal("0.00024"),
    )
    legacy = to_legacy_ladder(decision)
    assert isinstance(legacy, list)
    for tup in legacy:
        assert len(tup) == 3
        amount, rate, period = tup
        assert isinstance(amount, Decimal)
        assert rate is None or isinstance(rate, Decimal)
        assert isinstance(period, int)


# ─────────────────────────────────────────────────────────
# total_apr_estimate_pct convenience
# ─────────────────────────────────────────────────────────


def test_apr_estimate_excludes_frr_market_tranches():
    """Tranches with rate_daily=None are unknown until match — they shouldn't
    distort the headline APR estimate."""
    decision = select_strategy(
        amount=Decimal("200"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_empty_signals(),  # forces fallback to FRR market None
        frr_daily=None,
    )
    # All tranches are None-rate, so estimate is 0
    assert decision.total_apr_estimate_pct == Decimal(0)


def test_apr_estimate_weights_by_amount():
    decision = select_strategy(
        amount=Decimal("10000"),
        preset=EarnStrategyPreset.BALANCED.value,
        signals=_signals_2d_dominant(),
        frr_daily=Decimal("0.00024"),
    )
    # Should be a meaningful positive number
    assert decision.total_apr_estimate_pct > Decimal(0)
    # Sanity: not insane
    assert decision.total_apr_estimate_pct < Decimal(50)
