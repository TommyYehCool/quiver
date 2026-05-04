"""Pure-function tests for auto_lend ladder + period selection (F-5a-3.x + 3.5).

Why these tests matter: the ladder/period logic is the heart of how Quiver
beats FRR. It branches by strategy preset (CONSERVATIVE / BALANCED /
AGGRESSIVE), by amount eligibility, and by base_rate availability. Easy
to break silently when adding new presets or tweaking tranche shapes.

These are pure functions — no DB, no network, no clock. We test:
  - _ladder_tranches_for / _period_thresholds_for table integrity
  - _select_period_days bracket boundaries
  - _build_ladder eligibility, totals, per-tranche shape
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models.earn import EarnStrategyPreset
from app.services.earn.auto_lend import (
    DEFAULT_OFFER_PERIOD_DAYS,
    LADDER_TRANCHES_AGGRESSIVE,
    LADDER_TRANCHES_BALANCED,
    LADDER_TRANCHES_CONSERVATIVE,
    MIN_AUTO_LEND_USDT,
    PERIOD_RATE_THRESHOLDS_APR_AGGRESSIVE,
    PERIOD_RATE_THRESHOLDS_APR_BALANCED,
    PERIOD_RATE_THRESHOLDS_APR_CONSERVATIVE,
    _build_ladder,
    _ladder_tranches_for,
    _period_thresholds_for,
    _select_period_days,
)


# ─────────────────────────────────────────────────────────
# Table integrity: fractions sum to 1, table sizes match expectation
# ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "name,table,expected_size",
    [
        ("conservative", LADDER_TRANCHES_CONSERVATIVE, 3),
        ("balanced", LADDER_TRANCHES_BALANCED, 5),
        ("aggressive", LADDER_TRANCHES_AGGRESSIVE, 5),
    ],
)
def test_ladder_table_fractions_sum_to_one(
    name: str, table: list, expected_size: int
) -> None:
    """Every preset's fractions must sum to exactly 1.00 — otherwise the
    bulk of the deposit silently leaks (rounding gets attributed to the
    last tranche, but only because the math is supposed to add up)."""
    assert len(table) == expected_size, f"{name} expected {expected_size} tranches"
    total_fraction = sum((frac for frac, _ in table), Decimal(0))
    assert total_fraction == Decimal("1.00"), (
        f"{name} fractions sum to {total_fraction}, must be exactly 1.00"
    )


def test_ladder_table_multipliers_monotonically_non_decreasing() -> None:
    """Each tranche's rate multiplier must be ≥ the previous one — the whole
    point of the ladder is that later tranches sit at higher rates."""
    for name, table in [
        ("conservative", LADDER_TRANCHES_CONSERVATIVE),
        ("balanced", LADDER_TRANCHES_BALANCED),
        ("aggressive", LADDER_TRANCHES_AGGRESSIVE),
    ]:
        mults = [m for _, m in table]
        for i in range(1, len(mults)):
            assert mults[i] >= mults[i - 1], (
                f"{name}: tranche {i} multiplier {mults[i]} < {mults[i - 1]}"
            )


# ─────────────────────────────────────────────────────────
# Preset dispatch — _ladder_tranches_for / _period_thresholds_for
# ─────────────────────────────────────────────────────────


def test_ladder_tranches_for_returns_correct_table_per_preset() -> None:
    assert _ladder_tranches_for(EarnStrategyPreset.CONSERVATIVE.value) == LADDER_TRANCHES_CONSERVATIVE
    assert _ladder_tranches_for(EarnStrategyPreset.BALANCED.value) == LADDER_TRANCHES_BALANCED
    assert _ladder_tranches_for(EarnStrategyPreset.AGGRESSIVE.value) == LADDER_TRANCHES_AGGRESSIVE


def test_ladder_tranches_for_unknown_preset_falls_back_to_balanced() -> None:
    """Defensive: unknown preset string shouldn't crash, should pick the
    safest production-default behaviour (balanced)."""
    assert _ladder_tranches_for("nonexistent-preset") == LADDER_TRANCHES_BALANCED
    assert _ladder_tranches_for("") == LADDER_TRANCHES_BALANCED


def test_period_thresholds_for_returns_correct_table_per_preset() -> None:
    assert _period_thresholds_for("conservative") == PERIOD_RATE_THRESHOLDS_APR_CONSERVATIVE
    assert _period_thresholds_for("balanced") == PERIOD_RATE_THRESHOLDS_APR_BALANCED
    assert _period_thresholds_for("aggressive") == PERIOD_RATE_THRESHOLDS_APR_AGGRESSIVE
    assert _period_thresholds_for("anything-else") == PERIOD_RATE_THRESHOLDS_APR_BALANCED


# ─────────────────────────────────────────────────────────
# _select_period_days — bracket boundaries per preset
# ─────────────────────────────────────────────────────────


def _apr_to_daily(apr_pct: float) -> Decimal:
    """Convert APR % (e.g., 5 for 5%) to daily rate."""
    return Decimal(str(apr_pct)) / Decimal(100) / Decimal(365)


def test_select_period_days_none_rate_returns_default() -> None:
    """rate_daily=None means FRR mode — no rate to anchor period off, use default."""
    for preset in ("conservative", "balanced", "aggressive"):
        assert _select_period_days(None, preset) == DEFAULT_OFFER_PERIOD_DAYS == 2


@pytest.mark.parametrize(
    "apr_pct,expected_days",
    [
        # BALANCED brackets per PERIOD_RATE_THRESHOLDS_APR_BALANCED
        (0.5, 2),    # < 5% APR → 2 days
        (4.99, 2),
        (5.0, 7),    # 5-10% → 7 days
        (9.99, 7),
        (10.0, 14),  # 10-15% → 14 days
        (14.99, 14),
        (15.0, 30),  # >= 15% → 30 days
        (50.0, 30),  # extreme spike still capped at 30 (balanced doesn't go higher)
    ],
)
def test_select_period_days_balanced_brackets(apr_pct: float, expected_days: int) -> None:
    rate = _apr_to_daily(apr_pct)
    assert _select_period_days(rate, "balanced") == expected_days


@pytest.mark.parametrize(
    "apr_pct,expected_days",
    [
        # CONSERVATIVE brackets — capped at 7 days for liquidity
        (0.5, 2),
        (4.99, 2),
        (5.0, 4),    # 5-10% → 4 days
        (9.99, 4),
        (10.0, 7),   # >= 10% → 7 days (CAP)
        (50.0, 7),   # never longer than 7 — that's the conservative trade-off
    ],
)
def test_select_period_days_conservative_brackets(
    apr_pct: float, expected_days: int
) -> None:
    rate = _apr_to_daily(apr_pct)
    assert _select_period_days(rate, "conservative") == expected_days


@pytest.mark.parametrize(
    "apr_pct,expected_days",
    [
        # AGGRESSIVE brackets — locks high rates for up to 60 days
        (0.5, 2),    # < 3% → 2 days
        (2.99, 2),
        (3.0, 7),    # 3-7% → 7 days
        (6.99, 7),
        (7.0, 14),   # 7-12% → 14 days
        (11.99, 14),
        (12.0, 30),  # 12-20% → 30 days
        (19.99, 30),
        (20.0, 60),  # >= 20% → 60 days (max)
        (100.0, 60),
    ],
)
def test_select_period_days_aggressive_brackets(
    apr_pct: float, expected_days: int
) -> None:
    rate = _apr_to_daily(apr_pct)
    assert _select_period_days(rate, "aggressive") == expected_days


def test_select_period_days_default_preset_is_balanced() -> None:
    """No preset arg passed → must behave exactly like balanced (backward compat
    for callers added before F-5a-3.5)."""
    for apr in (0.5, 5.5, 12.0, 22.0):
        rate = _apr_to_daily(apr)
        assert _select_period_days(rate) == _select_period_days(rate, "balanced")


# ─────────────────────────────────────────────────────────
# _build_ladder — eligibility + totals + tranche shape
# ─────────────────────────────────────────────────────────


def test_build_ladder_below_threshold_returns_single_tranche() -> None:
    """Amount × smallest_fraction < MIN_AUTO_LEND_USDT (150) means at least one
    tranche would be under Bitfinex's per-offer minimum. Falls back to one
    big offer at base_rate."""
    # Balanced smallest fraction is 0.03 → activates at 5000 USDT.
    # 4999 × 0.03 = 149.97 < 150 → fallback
    base = _apr_to_daily(5.25)
    result = _build_ladder(Decimal("4999"), base, "balanced")
    assert len(result) == 1
    chunk, rate, period = result[0]
    assert chunk == Decimal("4999")
    assert rate == base
    assert period == _select_period_days(base, "balanced")


def test_build_ladder_at_eligibility_floor_uses_full_ladder() -> None:
    """Right at the eligibility floor (smallest_chunk == MIN_AUTO_LEND_USDT),
    ladder should kick in with all K tranches."""
    base = _apr_to_daily(5.25)
    # Balanced: smallest fraction 0.03; floor = 150 / 0.03 = 5000
    result = _build_ladder(Decimal("5000"), base, "balanced")
    assert len(result) == 5


def test_build_ladder_eligibility_floors_per_preset() -> None:
    """Each preset has its own floor based on its smallest fraction:
        conservative (smallest 0.05) → activates at $3000
        balanced     (smallest 0.03) → activates at $5000
        aggressive   (smallest 0.08) → activates at $1875

    Just below floor → 1 tranche; at-or-above → full ladder.
    """
    base = _apr_to_daily(5.25)
    cases = [
        ("conservative", Decimal("2999"), Decimal("3000"), 3),
        ("balanced", Decimal("4999"), Decimal("5000"), 5),
        ("aggressive", Decimal("1874"), Decimal("1875"), 5),
    ]
    for preset, below, at_floor, expected_K in cases:
        below_result = _build_ladder(below, base, preset)
        at_result = _build_ladder(at_floor, base, preset)
        assert len(below_result) == 1, f"{preset} should be single below floor"
        assert len(at_result) == expected_K, (
            f"{preset} should have K={expected_K} at floor"
        )


def test_build_ladder_none_base_rate_returns_single_frr_tranche() -> None:
    """When base_rate is None (market data unavailable), we can't compute
    multiplied rates, so fall back to a single FRR offer."""
    for preset in ("conservative", "balanced", "aggressive"):
        result = _build_ladder(Decimal("10000"), None, preset)
        assert len(result) == 1
        chunk, rate, period = result[0]
        assert chunk == Decimal("10000")
        assert rate is None  # FRR mode
        assert period == DEFAULT_OFFER_PERIOD_DAYS == 2


def test_build_ladder_chunks_sum_exactly_to_amount() -> None:
    """The last tranche absorbs rounding so the total is always exact —
    ZERO floating-point drift should leak the user's principal."""
    base = _apr_to_daily(5.25)
    for amount_str in ("5000", "10000.55", "12345.67", "99999.99"):
        amount = Decimal(amount_str)
        for preset in ("conservative", "balanced", "aggressive"):
            ladder = _build_ladder(amount, base, preset)
            total = sum((c for c, _, _ in ladder), Decimal(0))
            assert total == amount, (
                f"{preset} ladder total {total} != input {amount}"
            )


def test_build_ladder_rates_strictly_increase_through_tranches() -> None:
    """Within a single ladder, rates must monotonically increase — that's the
    whole 'baseline + spike capture' design intent."""
    base = _apr_to_daily(5.25)
    for preset in ("conservative", "balanced", "aggressive"):
        ladder = _build_ladder(Decimal("10000"), base, preset)
        if len(ladder) < 2:
            continue
        rates = [r for _, r, _ in ladder]
        # All rates non-None when base_rate is non-None
        assert all(r is not None for r in rates)
        for i in range(1, len(rates)):
            assert rates[i] >= rates[i - 1], (
                f"{preset}: tranche {i} rate {rates[i]} < {rates[i - 1]}"
            )


def test_build_ladder_aggressive_extreme_tranche_locks_60_days() -> None:
    """The whole point of AGGRESSIVE preset is locking spike yield long.
    With base_rate = 5.25% APR, the 4× extreme tranche = 21% APR,
    which under aggressive thresholds → 60 days."""
    base = _apr_to_daily(5.25)
    ladder = _build_ladder(Decimal("10000"), base, "aggressive")
    # Extreme tranche = last one (highest multiplier)
    _, rate, period = ladder[-1]
    apr = float(rate * Decimal(365) * Decimal(100))
    assert apr > 20.0, f"extreme tranche APR {apr}% should be > 20"
    assert period == 60, f"aggressive extreme tranche should lock 60d, got {period}"


def test_build_ladder_conservative_caps_period_at_7_days() -> None:
    """Conservative trades upside for liquidity — even the highest tranche
    must never lock more than 7 days."""
    base = _apr_to_daily(5.25)
    ladder = _build_ladder(Decimal("10000"), base, "conservative")
    for _, _, period in ladder:
        assert period <= 7, f"conservative period {period}d violates 7d cap"


def test_build_ladder_balanced_extreme_tranche_at_30_days() -> None:
    """Balanced (default) extreme tranche at 21% APR → 30d per the
    balanced threshold table."""
    base = _apr_to_daily(5.25)
    ladder = _build_ladder(Decimal("10000"), base, "balanced")
    _, _, last_period = ladder[-1]
    assert last_period == 30


def test_build_ladder_default_preset_matches_balanced() -> None:
    """No preset arg → must produce same ladder as explicit balanced."""
    base = _apr_to_daily(5.25)
    no_preset = _build_ladder(Decimal("10000"), base)
    explicit_balanced = _build_ladder(Decimal("10000"), base, "balanced")
    assert no_preset == explicit_balanced


def test_build_ladder_per_tranche_minimum_respected() -> None:
    """Every tranche must be >= MIN_AUTO_LEND_USDT (Bitfinex per-offer minimum).
    If this ever breaks, submit_funding_offer will reject and the cycle
    stalls."""
    base = _apr_to_daily(5.25)
    for preset in ("conservative", "balanced", "aggressive"):
        # Use the minimum eligible amount for the preset (just above floor)
        eligible_amounts = {
            "conservative": Decimal("3000"),
            "balanced": Decimal("5000"),
            "aggressive": Decimal("1875"),
        }
        amount = eligible_amounts[preset]
        ladder = _build_ladder(amount, base, preset)
        for chunk, _, _ in ladder:
            assert chunk >= MIN_AUTO_LEND_USDT, (
                f"{preset} at {amount} produced sub-min tranche {chunk}"
            )


def test_build_ladder_huge_amount_proportions_preserved() -> None:
    """At 100k USDT (well above any floor), tranche fractions should match
    the table almost exactly (only the last tranche absorbs rounding,
    which is sub-cent at this scale)."""
    base = _apr_to_daily(10.5)
    amount = Decimal("100000")
    ladder = _build_ladder(amount, base, "balanced")
    table = LADDER_TRANCHES_BALANCED
    # Each non-last tranche should be exactly amount × fraction
    for i in range(len(table) - 1):
        expected = (amount * table[i][0]).quantize(Decimal("0.01"))
        actual = ladder[i][0]
        assert actual == expected, (
            f"balanced tranche {i}: expected {expected}, got {actual}"
        )
