"""Funding rate spike detector — F-5a-3.1.

Phase-1 logging only: scans the public Bitfinex funding order book on each
cron tick, identifies "spike" conditions (high-rate offers sitting in the
book waiting for desperate borrowers), and logs the data. No action taken
yet — F-5a-3.4 will add spike capture pool that posts tactical offers
when spikes are detected.

What we log:
  - FRR (Flash Return Rate, Bitfinex's floating average) APY
  - Top-of-book ask APY (cheapest lender currently posting)
  - Highest active offer APY (extreme spike candidate)
  - Total amount posted at >= SPIKE_THRESHOLD_APY
  - Whether a spike condition is present

The cron-side caller can filter `is_spike` to alert / inform the user.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.core.logging import get_logger
from app.services.earn.bitfinex_adapter import (
    BookOffer,
    fetch_funding_book,
    fetch_market_frr,
)

logger = get_logger(__name__)


# A USDT funding offer above this APR is "elevated" — well above the typical
# 5-7% baseline that USDT pays. Worth tracking.
SPIKE_THRESHOLD_APY = Decimal("12")

# An offer above this APR signals an "extreme spike" — usually correlates with
# market volatility (BTC pump/dump triggering forced liquidations). These are
# the F-5a-3.4 capture targets.
EXTREME_SPIKE_APY = Decimal("30")


@dataclass(frozen=True)
class SpikeReading:
    """One snapshot of the funding market for a single symbol."""

    symbol: str
    frr_apy: Decimal | None              # Bitfinex's floating average
    top_ask_apy: Decimal | None          # cheapest lender currently posting
    max_offer_apy: Decimal | None        # highest rate any lender is asking
    elevated_offer_count: int            # # of offers with apr >= SPIKE_THRESHOLD
    elevated_total_usdt: Decimal         # total amount above SPIKE_THRESHOLD
    extreme_offer_count: int             # # of offers with apr >= EXTREME_SPIKE
    extreme_top_offers: list[BookOffer]  # raw top-N extreme offers (for logging)
    is_spike: bool                       # any extreme offer present?


async def scan_market(symbol: str = "fUST") -> SpikeReading:
    """Fetch FRR + funding book, compute spike summary. Safe on API errors —
    returns SpikeReading with None / 0 fields if Bitfinex is unreachable."""

    market = await fetch_market_frr()
    book = await fetch_funding_book(symbol=symbol, length=100)

    frr_apy = market.frr_apy_pct if market else None

    if not book:
        return SpikeReading(
            symbol=symbol,
            frr_apy=frr_apy,
            top_ask_apy=None,
            max_offer_apy=None,
            elevated_offer_count=0,
            elevated_total_usdt=Decimal(0),
            extreme_offer_count=0,
            extreme_top_offers=[],
            is_spike=False,
        )

    # Book is sorted ascending by rate; first is cheapest, last is most aggressive
    top_ask = book[0]
    max_offer = book[-1]

    elevated = [o for o in book if o.apr_pct >= SPIKE_THRESHOLD_APY]
    extreme = [o for o in book if o.apr_pct >= EXTREME_SPIKE_APY]
    elevated_total = sum((o.amount for o in elevated), Decimal(0))

    return SpikeReading(
        symbol=symbol,
        frr_apy=frr_apy,
        top_ask_apy=top_ask.apr_pct,
        max_offer_apy=max_offer.apr_pct,
        elevated_offer_count=len(elevated),
        elevated_total_usdt=elevated_total,
        extreme_offer_count=len(extreme),
        # Cap log volume — log up to top-5 extreme offers to keep log lines bounded.
        extreme_top_offers=sorted(extreme, key=lambda o: -o.apr_pct)[:5],
        is_spike=len(extreme) > 0,
    )


def log_reading(reading: SpikeReading) -> None:
    """Emit a structured log line for the spike snapshot. Safe to call always —
    callers don't need to filter on is_spike."""
    logger.info(
        "funding_spike_scan",
        symbol=reading.symbol,
        frr_apy=str(reading.frr_apy) if reading.frr_apy else None,
        top_ask_apy=str(reading.top_ask_apy) if reading.top_ask_apy else None,
        max_offer_apy=str(reading.max_offer_apy) if reading.max_offer_apy else None,
        elevated_count=reading.elevated_offer_count,
        elevated_total_usdt=str(reading.elevated_total_usdt),
        extreme_count=reading.extreme_offer_count,
        is_spike=reading.is_spike,
        # Don't dump full extreme_top_offers list — too noisy. Just count + max.
    )
    if reading.is_spike:
        # Separate WARNING-level line on spike for easier alerting / grep.
        for offer in reading.extreme_top_offers:
            logger.warning(
                "funding_spike_offer_detail",
                symbol=reading.symbol,
                rate_apr=str(offer.apr_pct),
                period_days=offer.period_days,
                amount=str(offer.amount),
                count=offer.count,
            )
