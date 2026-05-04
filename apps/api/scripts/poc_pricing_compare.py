"""
PoC: Compare 4 funding-offer pricing strategies against today's live order book.

Backstory
=========
poc_ladder_fill_audit.py revealed:
  - Tommy's $200 loan filled at 2.92% APR
  - Live FRR was ~3.06% APR
  - Effective multiplier: 0.95× (i.e. 5% BELOW FRR)
  - Cause: depth-walk pricing with BOOK_DEPTH_FACTOR=2 anchors us 2× our
    size deep in the queue → undercuts FRR for fast-fill speed.

Question
========
For our current capital size in the current market, how much rate are we
giving up vs alternative pricing strategies? Should we tweak?

Strategies compared
===================
  1. Production (depth-walk, factor=2)  — current code
  2. Depth-walk, factor=1 (less aggressive — land behind 1× our size)
  3. FRR-floor depth-walk (factor=2 BUT never undercut FRR — rate = max(walk, FRR))
  4. FRR-only (rate=None — Bitfinex auto-matches at prevailing FRR)
  5. Top-of-book ask (most aggressive — match the cheapest existing offer)

Output
======
For a sample size ($200, $1000, $5000): print the rate each strategy would
post, the implied APR, and the gap vs FRR.

This is read-only, no DB writes, no offers submitted. Pure live snapshot.

Usage
=====
    docker compose exec -T -e PYTHONPATH=/app api \\
        python /app/scripts/poc_pricing_compare.py
"""

from __future__ import annotations

import asyncio
from decimal import Decimal

from app.services.earn.bitfinex_adapter import (
    fetch_funding_book,
    fetch_market_frr,
)


async def compute_strategies(amount: Decimal) -> dict:
    """For a given offer amount, what rate would each strategy post?

    Returns dict {strategy_name: rate_daily or None}.
    """
    book = await fetch_funding_book()
    market = await fetch_market_frr()

    out: dict[str, Decimal | None] = {}

    if not market:
        print("  ⚠️  Could not fetch FRR market — Bitfinex API issue?")
        return out

    frr = market.last_daily  # FRR is the last_daily on the funding ticker
    ask = market.ask_daily   # Top-of-book ask
    out["frr_market"] = frr  # for reference, not a strategy

    # ── Strategy 1: production (depth-walk factor 2)
    if book:
        target_2x = amount * Decimal(2)
        cumulative = Decimal(0)
        for offer in book:
            cumulative += offer.amount
            if cumulative >= target_2x:
                out["1. depth-walk f=2 (production)"] = offer.rate_daily
                break
        else:
            out["1. depth-walk f=2 (production)"] = book[-1].rate_daily

    # ── Strategy 2: depth-walk factor 1
    if book:
        target_1x = amount
        cumulative = Decimal(0)
        for offer in book:
            cumulative += offer.amount
            if cumulative >= target_1x:
                out["2. depth-walk f=1 (less aggressive)"] = offer.rate_daily
                break
        else:
            out["2. depth-walk f=1 (less aggressive)"] = book[-1].rate_daily

    # ── Strategy 3: FRR-floor depth-walk
    s1 = out.get("1. depth-walk f=2 (production)")
    if s1 is not None and frr > 0:
        out["3. FRR-floor depth-walk (max(walk, FRR))"] = max(s1, frr)

    # ── Strategy 4: FRR-only
    out["4. FRR-only (rate=None)"] = frr if frr > 0 else None

    # ── Strategy 5: top-of-book
    out["5. top-of-book ask (most aggressive)"] = ask if ask > 0 else None

    return out


def fmt_rate(rate_daily: Decimal | None) -> str:
    if rate_daily is None or rate_daily <= 0:
        return "    —     "
    apr = rate_daily * Decimal(365) * Decimal(100)
    return f"{rate_daily*100:.5f}%/d  ({apr:.2f}% APR)"


def fmt_gap(rate: Decimal | None, frr: Decimal | None) -> str:
    if rate is None or frr is None or frr <= 0:
        return ""
    pct = (rate - frr) / frr * 100
    sign = "+" if pct >= 0 else ""
    return f"  {sign}{pct:.1f}% vs FRR"


async def main() -> None:
    print("=== Live Bitfinex funding pricing comparison ===\n")
    print("  Pulling live /v2/book/fUST/P0 + /v2/ticker/fUST...\n")

    sample_sizes = [Decimal("200"), Decimal("1000"), Decimal("5000")]

    for amount in sample_sizes:
        print(f"━━━ Offer amount: ${amount:,.0f} ━━━")
        strategies = await compute_strategies(amount)
        if not strategies:
            print("  (no data)")
            continue

        frr = strategies.pop("frr_market", None)
        if frr:
            print(f"  📍 FRR (reference):                    {fmt_rate(frr)}")
            print()

        for name, rate in strategies.items():
            gap = fmt_gap(rate, frr)
            print(f"  {name:<40s}  {fmt_rate(rate)}{gap}")
        print()

    # ── Verdict
    strategies_5k = await compute_strategies(Decimal("5000"))
    frr = strategies_5k.get("frr_market")
    s1 = strategies_5k.get("1. depth-walk f=2 (production)")
    s3 = strategies_5k.get("3. FRR-floor depth-walk (max(walk, FRR))")

    print("=== Verdict (using $5,000 reference — ladder-eligible size) ===\n")
    if s1 and frr and s1 < frr:
        gap_pct = float((frr - s1) / frr * 100)
        print(f"  Production undercuts FRR by {gap_pct:.1f}% on a $5K offer.")
        print(f"  On 365 days × $5K capital, that's ~${5000 * float(frr - s1) * 365:.0f} of foregone interest per year.")
        print()
        print("  → Recommended: switch to Strategy 3 (FRR-floor depth-walk).")
        print("    Walk the book for queue position, but never post below FRR.")
        print("    Code change: in _compute_competitive_rate(), wrap the return:")
        print("      rate = max(rate, frr_market_rate)")
        print()
        print("  → Risk: in a falling market, posting at FRR (vs slightly below) may")
        print("    leave us further back in the queue and idle longer. But idle at")
        print("    FRR > filled below FRR for the same time, so net should be positive.")
    elif s1 and frr:
        gap_pct = float((s1 - frr) / frr * 100)
        print(f"  Production landed ABOVE FRR by {gap_pct:.1f}% — book is thin or favorable today.")
        print("  No optimisation needed in this market state. Re-run when book is deeper.")
    else:
        print("  Could not compute production rate — book or FRR missing.")


if __name__ == "__main__":
    asyncio.run(main())
