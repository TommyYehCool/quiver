"""
PoC: Quiver Pulse — 4-state market regime detector + ladder backtester.

Hypothesis
==========
A simple rules-based regime classifier (cold / normal / hot / spike) for
Bitfinex USDT funding can pick better ladder allocations than the fixed
Balanced strategy currently in production.

If true: justifies building a "Quiver Pulse" feature — adaptive ladder
allocation based on detected regime — without committing to ML.

If false: confirms the current fixed-allocation Balanced ladder is robust
across regimes, and we should look elsewhere for alpha (e.g. better fill
prediction, multi-currency arbitrage).

Method
======
1. Fetch 1y of public Bitfinex data (no API key required):
   - fUST daily candles      → daily USDT funding rate (USDT lending market)
   - tBTCUSD daily candles   → BTC price (volatility proxy)

2. Compute features per day:
   - frr_today_apr        = today's close rate × 365 × 100
   - frr_7d_avg_apr       = trailing 7-day mean of frr
   - frr_24h_change_pct   = today vs yesterday rate ratio
   - btc_vol_7d           = stdev of last 7 daily BTC returns

3. Classify regime per day (rules — no ML):
   - Cold:    frr_today < 5% AND frr_today <= frr_7d
   - Normal:  5% <= frr_today < 10%
   - Hot:     10% <= frr_today < 20%
   - Spike:   frr_today >= 20% OR frr_24h_change > 2.0×

4. Build ladder per strategy (mirrors production constants):
   - Baseline FRR-2d    : all $ at today's FRR for 2 days (no ladder)
   - Balanced Fixed     : 60/20/10/7/3 at 1.0× / 1.2× / 1.5× / 2.0× / 4.0×
   - Pulse Adaptive     : ladder shape varies by regime (see PULSE_LADDERS)

5. Simulate fill + earnings per day:
   - Each tranche has a price = FRR × multiplier
   - Period selected by production's PERIOD_RATE_THRESHOLDS_APR_BALANCED
   - Fill model (proxy for missing order-book history):
     - Look at next `period_days` of FRR
     - If MAX(future_frr) >= tranche_price → tranche fills at MAX(future_frr)
     - Else → tranche sits idle (earns 0 that period)
   - Earnings = sum across tranches of (alloc% × fill_apr × period_days/365)

6. Roll forward: each day's deposits assumed re-allocated daily (rolling 1y).

7. Compare cumulative APR across strategies, plus regime distribution.

Caveats
=======
- Fill model is a heavy approximation. Real Bitfinex order book has lots of
  competing offers. A tranche priced at 1.5× FRR may fill at lower than
  MAX(FRR) because better-priced offers exist. This proxy *over-estimates*
  fills, but does so equally across strategies, so the *delta* between
  strategies is still informative.
- 4-state classifier is intentionally simple. If it adds even +0.5% APR
  delta over Balanced Fixed, more sophisticated models (XGBoost on the
  same features) likely do meaningfully better.
- Lock-in risk not modeled: in real life a 30d locked offer at 5% APR is
  a curse if rates spike to 30% next day. Backtest assumes you held to
  maturity at the locked rate.

Usage
=====
    python apps/api/scripts/poc_market_pulse.py

Standalone — no DB, no auth, no production deps. Pure stdlib + httpx.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

API_BASE = "https://api-pub.bitfinex.com"

# ─────────────────────────────────────────────────────────
# Production constants (kept in sync with auto_lend.py)
# ─────────────────────────────────────────────────────────

# (alloc_fraction, rate_multiplier_above_base) — Balanced default
LADDER_BALANCED: list[tuple[float, float]] = [
    (0.60, 1.00),
    (0.20, 1.20),
    (0.10, 1.50),
    (0.07, 2.00),
    (0.03, 4.00),
]

# Period selection (Balanced): pick first row where APR >= threshold
PERIOD_THRESHOLDS_BALANCED: list[tuple[float, int]] = [
    (15.0, 30),
    (10.0, 14),
    (5.0, 7),
    (0.0, 2),
]


def select_period_days(apr: float) -> int:
    for threshold, days in PERIOD_THRESHOLDS_BALANCED:
        if apr >= threshold:
            return days
    return 2


# ─────────────────────────────────────────────────────────
# Quiver Pulse — adaptive ladder per regime
# ─────────────────────────────────────────────────────────
# Intuition:
#   Cold:   no spike likely, push more weight to base for fast fill;
#           don't waste capital on high-mult tranches that won't fill.
#   Normal: production default Balanced (60/20/10/7/3).
#   Hot:    spike likely — allocate more to mid tranches (1.2 / 1.5).
#   Spike:  spike happening NOW — heavily overweight high tranches AND
#           lock long to capture the elevated rate before it reverts.
PULSE_LADDERS: dict[str, list[tuple[float, float]]] = {
    "cold":   [(0.85, 1.0), (0.10, 1.2), (0.05, 1.5), (0.0, 2.0), (0.0, 4.0)],
    "normal": [(0.60, 1.0), (0.20, 1.2), (0.10, 1.5), (0.07, 2.0), (0.03, 4.0)],
    "hot":    [(0.40, 1.0), (0.30, 1.2), (0.15, 1.5), (0.10, 2.0), (0.05, 4.0)],
    "spike":  [(0.20, 1.0), (0.20, 1.2), (0.20, 1.5), (0.20, 2.0), (0.20, 4.0)],
}


@dataclass
class Day:
    ts: datetime
    frr_apr: float          # today's close, annualised %
    btc_close: float
    btc_return_pct: float | None  # day-over-day return %


# ─────────────────────────────────────────────────────────
# Data fetch
# ─────────────────────────────────────────────────────────


def fetch_candles(symbol: str, period_suffix: str = "", limit: int = 365) -> list[list]:
    """Fetch daily candles from Bitfinex public API.

    symbol: e.g. "fUST", "tBTCUSD"
    period_suffix: e.g. ":p2" for funding 2-day period, "" for trade pair
    """
    sym_path = f"{symbol}{period_suffix}"
    url = f"{API_BASE}/v2/candles/trade:1D:{sym_path}/hist"
    r = httpx.get(url, params={"limit": limit}, timeout=30.0)
    r.raise_for_status()
    return r.json()


def load_data(days: int = 365) -> list[Day]:
    """Fetch fUST + BTC, align by date, return chronological list."""
    print(f"Fetching {days}d of fUST funding rate + BTC price...")
    frr_raw = fetch_candles("fUST", ":p2", limit=days)
    btc_raw = fetch_candles("tBTCUSD", "", limit=days)

    # Bitfinex returns newest first — reverse to chronological
    frr_raw.reverse()
    btc_raw.reverse()

    # Index by date (UTC midnight)
    frr_by_date: dict[str, float] = {}
    for row in frr_raw:
        # row: [mts, open, close, high, low, volume]
        ts = datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc)
        date_key = ts.strftime("%Y-%m-%d")
        # close-of-day rate × 365 × 100 = APR%
        frr_by_date[date_key] = row[2] * 365 * 100

    btc_by_date: dict[str, float] = {}
    for row in btc_raw:
        ts = datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc)
        date_key = ts.strftime("%Y-%m-%d")
        btc_by_date[date_key] = row[2]

    # Join by date
    common_dates = sorted(set(frr_by_date.keys()) & set(btc_by_date.keys()))
    out: list[Day] = []
    prev_btc: float | None = None
    for d in common_dates:
        btc = btc_by_date[d]
        ret = ((btc - prev_btc) / prev_btc * 100) if prev_btc else None
        out.append(Day(
            ts=datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc),
            frr_apr=frr_by_date[d],
            btc_close=btc,
            btc_return_pct=ret,
        ))
        prev_btc = btc
    print(f"  → {len(out)} aligned daily rows from {out[0].ts.date()} to {out[-1].ts.date()}")
    return out


# ─────────────────────────────────────────────────────────
# Regime classifier
# ─────────────────────────────────────────────────────────


def classify_regime(days: list[Day], i: int) -> str:
    """Look at days[0..i] to classify day i. Use only past data."""
    today = days[i]
    window = days[max(0, i - 7) : i]  # last 7 days excluding today
    if not window:
        return "normal"

    frr_7d_avg = statistics.mean(d.frr_apr for d in window)
    frr_yday = days[i - 1].frr_apr if i >= 1 else today.frr_apr
    frr_24h_change = today.frr_apr / frr_yday if frr_yday > 0.001 else 1.0

    if today.frr_apr >= 20.0 or frr_24h_change >= 2.0:
        return "spike"
    if today.frr_apr >= 10.0:
        return "hot"
    if today.frr_apr >= 5.0:
        return "normal"
    if today.frr_apr < 5.0 and today.frr_apr <= frr_7d_avg:
        return "cold"
    return "normal"


# ─────────────────────────────────────────────────────────
# Fill simulator + strategy backtester
# ─────────────────────────────────────────────────────────


def simulate_day_earnings(
    days: list[Day],
    i: int,
    ladder: list[tuple[float, float]],
) -> float:
    """Simulate one day's deposit. Returns weighted APR earned (annualised %).

    Each tranche:
      - price = today_FRR × multiplier
      - period_days = production rule based on price
      - If max(FRR over next period_days) >= price → fills at max(FRR), held to maturity
      - Else → sits idle, earns 0
    """
    today_frr = days[i].frr_apr
    n = len(days)
    weighted_apr = 0.0

    for alloc, mult in ladder:
        if alloc <= 0:
            continue
        tranche_price = today_frr * mult
        period_days = select_period_days(tranche_price)
        future_window = days[i + 1 : min(n, i + 1 + period_days)]
        if not future_window:
            # No data to know if it fills — treat as idle
            continue

        future_max_frr = max(d.frr_apr for d in future_window)
        if future_max_frr >= tranche_price:
            # Fills at the elevated rate, locked for period
            # (period contributes period/365 of the year — for fair APR comparison
            # we compute as: tranche earns `fill_apr × period/365` over the year
            # if reinvested at base. Simplest: just count the locked APR weighted
            # by how much of the year it takes.)
            fill_apr = future_max_frr
            weighted_apr += alloc * fill_apr
        # else: tranche idle this day
        # NOTE: we don't model the OPPORTUNITY COST of idle capital here.
        # Real-world idle capital could have been redeployed at base.
        # See "Caveats" in module docstring.

    return weighted_apr


def backtest(days: list[Day], strategy_name: str, ladder_fn) -> dict:
    """ladder_fn(days, i) -> list[(alloc, mult)]
    Returns summary stats.
    """
    n = len(days)
    daily_aprs: list[float] = []
    for i in range(n - 30):  # leave 30 day tail buffer for forward look
        ladder = ladder_fn(days, i)
        apr = simulate_day_earnings(days, i, ladder)
        daily_aprs.append(apr)
    avg_apr = statistics.mean(daily_aprs) if daily_aprs else 0.0
    return {
        "strategy": strategy_name,
        "avg_apr": avg_apr,
        "p50": statistics.median(daily_aprs),
        "p90": _percentile(daily_aprs, 90),
        "min": min(daily_aprs),
        "max": max(daily_aprs),
    }


def _percentile(xs: list[float], p: int) -> float:
    if not xs:
        return 0.0
    xs_sorted = sorted(xs)
    k = int(len(xs_sorted) * p / 100)
    return xs_sorted[min(k, len(xs_sorted) - 1)]


# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────


def main() -> None:
    days = load_data(days=730)  # 2y of data — backtest on most recent year, use first year as warm-up

    # Drop first 30 days (warm-up for rolling features)
    days = days[30:]
    print(f"\nBacktest window: {days[0].ts.date()} → {days[-30].ts.date()}")
    print(f"  ({len(days) - 30} trading days, last 30d held back as forward-look buffer)")

    # ── Regime distribution (sanity check the classifier)
    print("\n=== Regime distribution ===")
    regimes = [classify_regime(days, i) for i in range(len(days))]
    counts = {r: regimes.count(r) for r in ["cold", "normal", "hot", "spike"]}
    total = len(regimes)
    for r in ["cold", "normal", "hot", "spike"]:
        c = counts[r]
        bar = "█" * int(c / total * 40)
        print(f"  {r:7s} {c:4d} ({c/total*100:5.1f}%) {bar}")

    # ── Backtest 3 strategies
    print("\n=== Backtest results ===")

    def ladder_baseline_2d(days, i):
        return [(1.0, 1.0)]  # All money at FRR base, no ladder

    def ladder_balanced_fixed(days, i):
        return LADDER_BALANCED

    def ladder_pulse_adaptive(days, i):
        return PULSE_LADDERS[classify_regime(days, i)]

    results = [
        backtest(days, "Baseline FRR-only (no ladder)", ladder_baseline_2d),
        backtest(days, "Balanced Fixed (production)",   ladder_balanced_fixed),
        backtest(days, "Pulse Adaptive (this PoC)",     ladder_pulse_adaptive),
    ]

    print(f"\n  {'Strategy':<35s} {'avg APR':>9s} {'p50':>7s} {'p90':>7s} {'min':>6s} {'max':>7s}")
    print("  " + "─" * 78)
    baseline_apr = results[0]["avg_apr"]
    for r in results:
        delta = r["avg_apr"] - baseline_apr
        delta_str = f"({delta:+.2f})" if r is not results[0] else ""
        print(f"  {r['strategy']:<35s} "
              f"{r['avg_apr']:>8.2f}% {r['p50']:>6.2f}% {r['p90']:>6.2f}% "
              f"{r['min']:>5.2f}% {r['max']:>6.2f}% {delta_str}")

    # ── Verdict
    pulse_vs_balanced = results[2]["avg_apr"] - results[1]["avg_apr"]
    balanced_vs_baseline = results[1]["avg_apr"] - results[0]["avg_apr"]
    print()
    print("=== Verdict ===")
    print(f"  Balanced Fixed     vs Baseline:     {balanced_vs_baseline:+.2f}% APR  (production already wins {balanced_vs_baseline:+.1f}% by laddering)")
    print(f"  Pulse Adaptive     vs Balanced:     {pulse_vs_balanced:+.2f}% APR  (regime classifier value-add)")
    print()
    if pulse_vs_balanced >= 0.5:
        print("  🟢 Worth productionising. Even simple regime rules add real APR.")
        print("     Next step: train an XGBoost classifier on the same features for further +.")
    elif pulse_vs_balanced >= 0.0:
        print("  🟡 Marginal. Worth more thought before shipping.")
        print("     Consider: better fill model, more features, or look elsewhere for alpha.")
    else:
        print("  🔴 Pulse Adaptive HURTS performance. Fixed Balanced is robust.")
        print("     Implication: don't chase regime detection, look at multi-currency or fill-time optimisation.")


if __name__ == "__main__":
    main()
