"""Per-period funding market signals — F-5a-3.10.

Purpose
=======
F-5a-3.7 introduced FRR market orders for the base tranche, fixing the
6-27% undercut bug from depth-walk pricing. But FRR is a *cross-period*
weighted average that diverges sharply from the *per-period* clearing
rate when the term structure is steep:

    FRR (cross-period weighted)            8.7% APR
    2-day actual clearing                  4.4% APR
    30-day actual clearing                 7.8% APR

A 2-day FRR market order in the above conditions sits at the back of
the queue — borrowers route to fixed-rate offers at 4.4% first.

market_signals lets the strategy selector reason in *period-aware*
clearing prices instead of conflating the term structure into one
number. For each canonical period bucket (2 / 7 / 14 / 30 days) it
exposes:

  - median fill rate over the last N trades
  - 30-min volume (proxy for liquidity / how fast a fresh offer fills)
  - top-of-book ask (the marginal lender to beat)

Cached at module level for 60 s to amortize the 2 public API calls (trades
+ book) across multiple cron callers within a window. Cache is per-process;
multi-worker deployments will refresh independently which is fine.

This module has no dependency on user state — it's pure market data,
shared across all strategies.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from decimal import Decimal

from app.core.logging import get_logger
from app.services.earn.bitfinex_adapter import (
    BookOffer,
    FundingTrade,
    fetch_funding_book,
    fetch_funding_trades,
)

logger = get_logger(__name__)

# Canonical period buckets we evaluate. Bitfinex platform supports 2-30 days
# (offer side). These buckets cover the practical range; intermediate periods
# (e.g. 5-day) are bucketed to the nearest canonical via _bucket_period.
CANONICAL_PERIODS = (2, 7, 14, 30)

# How long signals are cached before re-fetch. 60 s is a balance between
# freshness (rates can move on minute scale during volatility) and rate-limit
# friendliness (Bitfinex public = 90 req/min IP-wide).
CACHE_TTL_SECONDS = 60

# Trades older than this are dropped from the median calculation. Keeps the
# signal "current" — a 2-hour-old fill at a stale rate shouldn't anchor
# today's strategy.
TRADE_LOOKBACK_MINUTES = 30

# Need at least this many same-period trades before trusting the signal.
# Below this we mark the bucket has_signal=False and the selector should
# fall back to FRR or skip the period.
MIN_TRADES_FOR_SIGNAL = 5


@dataclass(frozen=True)
class PeriodSignal:
    """Aggregated market signal for one period bucket."""

    period_days: int
    has_signal: bool             # False = not enough data, caller should fallback
    median_rate_daily: Decimal   # 0 if no signal
    volume_30min_usdt: Decimal   # cumulative |amount| in last 30 min
    trade_count_30min: int       # number of trades contributing to median
    top_ask_rate_daily: Decimal  # cheapest current offer in book (= competition)
    top_ask_amount_usdt: Decimal # size at the top of book

    @property
    def median_apr_pct(self) -> Decimal:
        return self.median_rate_daily * Decimal(365) * Decimal(100)


@dataclass(frozen=True)
class MarketSignals:
    """All-period snapshot with provenance."""

    fetched_at_ms: int
    by_period: dict[int, PeriodSignal]

    def get(self, period_days: int) -> PeriodSignal | None:
        """Lookup with bucket-snapping for non-canonical periods."""
        bucket = _bucket_period(period_days)
        return self.by_period.get(bucket)


# ─────────────────────────────────────────────────────────
# Internal cache
# ─────────────────────────────────────────────────────────

_cache: dict[str, MarketSignals] = {}  # keyed by currency code (UST / USD)
_cache_lock = asyncio.Lock()


def _bucket_period(period_days: int) -> int:
    """Snap an arbitrary period to the nearest canonical bucket."""
    if period_days <= 0:
        return CANONICAL_PERIODS[0]
    return min(CANONICAL_PERIODS, key=lambda p: abs(p - period_days))


def _is_cache_fresh(snap: MarketSignals | None) -> bool:
    if snap is None:
        return False
    age_ms = int(time.time() * 1000) - snap.fetched_at_ms
    return age_ms < CACHE_TTL_SECONDS * 1000


async def get_market_signals(
    force_refresh: bool = False,
    currency: str = "UST",
) -> MarketSignals:
    """Return the latest per-period market signals, refreshing if stale.

    F-5a-3.11: pass currency="USD" to get fUSD signals for the USD pivot
    flow. Default "UST" preserves existing fUST behavior. Cache is keyed
    by currency so the two markets stay independent.

    Concurrent callers within the cache window share one network round-trip
    via the asyncio.Lock. Forcing a refresh is mainly useful for tests and
    the dry-run preview endpoint where the user wants live data.
    """
    global _cache
    cache_key = currency.upper()
    cached = _cache.get(cache_key) if isinstance(_cache, dict) else None
    if not force_refresh and _is_cache_fresh(cached):
        return cached  # type: ignore[return-value]
    async with _cache_lock:
        cached = _cache.get(cache_key) if isinstance(_cache, dict) else None
        if not force_refresh and _is_cache_fresh(cached):
            return cached  # type: ignore[return-value]
        snap = await _fetch_fresh_signals(currency=cache_key)
        if not isinstance(_cache, dict):
            _cache = {}
        _cache[cache_key] = snap
        return snap


async def _fetch_fresh_signals(currency: str = "UST") -> MarketSignals:
    """Pull trades + book in parallel and aggregate into per-period signals."""
    symbol = f"f{currency.upper()}"
    # Parallel fetch — saves ~1 RTT vs serial. Both endpoints are public and
    # cost nothing extra to call together.
    trades_task = asyncio.create_task(fetch_funding_trades(symbol=symbol, limit=200))
    book_task = asyncio.create_task(fetch_funding_book(symbol=symbol, length=100))
    trades, book = await asyncio.gather(trades_task, book_task)

    # Filter trades to the recent window. Bitfinex returns newest-first.
    cutoff_ms = int(time.time() * 1000) - TRADE_LOOKBACK_MINUTES * 60 * 1000
    recent_trades = [t for t in trades if t.timestamp_ms >= cutoff_ms]

    # Bucket trades + book by canonical period
    trades_by_period: dict[int, list[FundingTrade]] = {p: [] for p in CANONICAL_PERIODS}
    for t in recent_trades:
        b = _bucket_period(t.period_days)
        trades_by_period[b].append(t)

    book_by_period: dict[int, list[BookOffer]] = {p: [] for p in CANONICAL_PERIODS}
    for o in book:
        b = _bucket_period(o.period_days)
        book_by_period[b].append(o)

    by_period: dict[int, PeriodSignal] = {}
    for period in CANONICAL_PERIODS:
        ts = trades_by_period[period]
        bs = book_by_period[period]

        has_signal = len(ts) >= MIN_TRADES_FOR_SIGNAL
        median_rate = _median([t.rate_daily for t in ts]) if has_signal else Decimal(0)
        volume = sum((t.amount for t in ts), Decimal(0))
        # book is already ascending-by-rate from fetch_funding_book
        top_ask_rate = bs[0].rate_daily if bs else Decimal(0)
        top_ask_amount = bs[0].amount if bs else Decimal(0)

        by_period[period] = PeriodSignal(
            period_days=period,
            has_signal=has_signal,
            median_rate_daily=median_rate,
            volume_30min_usdt=volume,
            trade_count_30min=len(ts),
            top_ask_rate_daily=top_ask_rate,
            top_ask_amount_usdt=top_ask_amount,
        )

    snap = MarketSignals(
        fetched_at_ms=int(time.time() * 1000),
        by_period=by_period,
    )

    # Structured log so we can track signal stability over time and debug
    # "why did the strategy pick X" questions weeks later.
    logger.info(
        "market_signals_refreshed",
        periods={
            p: {
                "median_apr": str(by_period[p].median_apr_pct.quantize(Decimal("0.01"))),
                "volume_30m": str(by_period[p].volume_30min_usdt.quantize(Decimal("1"))),
                "trades": by_period[p].trade_count_30min,
                "has_signal": by_period[p].has_signal,
            }
            for p in CANONICAL_PERIODS
        },
    )
    return snap


def _median(values: list[Decimal]) -> Decimal:
    """Return median of a non-empty list. Caller must check len() ≥ 1."""
    if not values:
        return Decimal(0)
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    if n % 2 == 1:
        return sorted_vals[n // 2]
    return (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / Decimal(2)


def reset_cache_for_tests() -> None:
    """Test helper — drop the in-memory cache so the next call refetches."""
    global _cache
    _cache = {}
