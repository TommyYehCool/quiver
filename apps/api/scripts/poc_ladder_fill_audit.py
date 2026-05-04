"""
PoC: Audit real ladder fills on Bitfinex — does the 5-tier strategy actually work?

Backstory
=========
poc_market_pulse.py backtested the Balanced ladder (60/20/10/7/3 across 1.0×
/ 1.2× / 1.5× / 2.0× / 4.0× rate multipliers) against an "all-in FRR" baseline
and found ladder LOST 0.7% APR. But the backtest's fill model was a heavy
proxy ("tranche fills iff some future day's FRR exceeds tranche price").

Real Bitfinex funding has gradient fills — a 1.2× FRR offer often clears at
1.05× because borrowers pay slightly more for partial supply at lower bands.
This audit pulls the actual fill history to find out:

  - What multiplier-of-FRR did our credits actually fill at?
  - Did high-mult tranches (1.5× / 2× / 4×) ever fill, or did they sit idle?
  - Compared to the Balanced target distribution (60/20/10/7/3),
    where did capital actually end up?

Method
======
1. Load each EarnBitfinexConnection from DB, decrypt API key/secret using
   the production crypto helper.
2. For each connection: pull historical funding credits via the production
   BitfinexFundingAdapter (auth API).
3. Pull historical FRR (public) for the same date range.
4. Per credit: multiplier = credit.rate / frr_on_open_date.
5. Bucket by multiplier band corresponding to ladder tranches.

Caveats
=======
- Only credits that have CLOSED appear here. Active loans (currently lent)
  are not in this audit — they don't have a final realised rate yet.
- This audit cannot tell us about offers that were SUBMITTED but never filled
  (Bitfinex purges those quickly). Unfilled = "idle capital" cost we can't
  observe directly.
- Rate-at-credit-opening is approximated by FRR-of-the-day (close).
  The actual order book at the exact minute of fill could differ ±10%.

Usage
=====
    docker compose exec -T -e PYTHONPATH=/app api \\
        python /app/scripts/poc_ladder_fill_audit.py

Or with custom history depth:
    poc_ladder_fill_audit.py --days 90
"""

from __future__ import annotations

import argparse
import asyncio
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.models.earn import EarnAccount, EarnBitfinexConnection
from app.services.earn.bitfinex_adapter import (
    BitfinexFundingAdapter,
)

PUB_BASE = "https://api-pub.bitfinex.com"
# Bitfinex uses "UST" (not "USDT") for Tether on funding endpoints —
# both for public AND auth (despite docs saying fUSDT works for auth).
# In our deployed accounts, fUST is what actually has data.
SYMBOL = "fUST"

# Min ladder activation thresholds (mirrors auto_lend.py)
LADDER_MIN_BALANCED = 5000
LADDER_MIN_CONSERVATIVE = 3000
LADDER_MIN_AGGRESSIVE = 1875

# Tranche bucket boundaries — match production ladder's 1.0× / 1.2× / 1.5×
# / 2.0× / 4.0× target multipliers, with a buffer band for FRR-of-day noise.
BUCKETS: list[tuple[str, float, float, str]] = [
    # (label, lo, hi, ladder_tranche_target)
    ("under-FRR (<0.95×)",   0.00, 0.95, "—"),
    ("≈ FRR (0.95-1.10×)",   0.95, 1.10, "T1: 1.0× target 60%"),
    ("1.1-1.35× (mild)",     1.10, 1.35, "T2: 1.2× target 20%"),
    ("1.35-1.75× (moderate)", 1.35, 1.75, "T3: 1.5× target 10%"),
    ("1.75-3.0× (high)",     1.75, 3.0,  "T4: 2.0× target 7%"),
    ("3.0× + (extreme)",     3.0,  999,  "T5: 4.0× target 3%"),
]


@dataclass
class Credit:
    id: int
    amount: Decimal
    rate_daily: Decimal
    period_days: int
    opened_at: datetime
    apr: float

    @property
    def date_key(self) -> str:
        return self.opened_at.strftime("%Y-%m-%d")


def fetch_frr_by_date(days_back: int) -> dict[str, float]:
    """Public API: fetch daily FRR for the last `days_back` days. Returns
    {date_string: APR%}."""
    url = f"{PUB_BASE}/v2/candles/trade:1D:{SYMBOL}:p2/hist"
    r = httpx.get(url, params={"limit": days_back + 30}, timeout=30.0)
    r.raise_for_status()
    raw = r.json()
    out: dict[str, float] = {}
    for row in raw:
        ts = datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc)
        out[ts.strftime("%Y-%m-%d")] = row[2] * 365 * 100
    return out


async def fetch_credits_hist(
    adapter: BitfinexFundingAdapter, days_back: int
) -> list[Credit]:
    """Fetch closed funding credits via production adapter.

    Bitfinex inconsistently classifies closed loans between `credits/hist`
    and `loans/hist` (we observed our $200 loan ends up in loans/hist, not
    credits/hist). So we hit BOTH endpoints and merge by ID.
    """
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - days_back * 86_400_000
    body = {"start": start_ms, "end": end_ms, "limit": 500}
    out: dict[int, Credit] = {}
    async with httpx.AsyncClient() as client:
        for kind in ("credits", "loans"):
            try:
                raw = await adapter._auth_post(
                    client, f"v2/auth/r/funding/{kind}/{SYMBOL}/hist", body
                )
            except httpx.HTTPStatusError as e:
                # 500 from this endpoint sometimes means "no data for this account"
                # — treat as empty and continue to the other endpoint.
                if e.response.status_code in (404, 500):
                    continue
                raise
            for row in raw:
                try:
                    cid = int(row[0])
                    if cid in out:
                        continue  # already have it from the other endpoint
                    side = int(row[2])
                    if side != 1:  # lender side only
                        continue
                    amount = Decimal(str(row[5]))
                    rate = Decimal(str(row[11]))
                    period = int(row[12])
                    opening_mts = int(row[13]) if row[13] else int(row[3])
                    opened_at = datetime.fromtimestamp(
                        opening_mts / 1000, tz=timezone.utc
                    )
                    apr = float(rate) * 365 * 100
                    out[cid] = Credit(cid, amount, rate, period, opened_at, apr)
                except (ValueError, TypeError, IndexError):
                    continue
    return list(out.values())


def bucket_for_multiplier(mult: float) -> tuple[str, str]:
    for label, lo, hi, target in BUCKETS:
        if lo <= mult < hi:
            return label, target
    return "?", "—"


async def audit_one_account(
    db, conn: EarnBitfinexConnection, frr_by_date: dict[str, float], days: int
) -> tuple[list[Credit], Decimal]:
    """Audit one user's funding history. Returns (credits, max_deposit_size)."""
    label = f"earn_account_id={conn.earn_account_id}"
    print(f"\n--- {label} ---")
    try:
        adapter = await BitfinexFundingAdapter.from_connection(db, conn)
    except Exception as e:
        print(f"  ✗ Could not load adapter: {e}")
        return [], Decimal(0)
    try:
        credits = await fetch_credits_hist(adapter, days)
    except httpx.HTTPStatusError as e:
        print(f"  ✗ HTTP {e.response.status_code}: {e.response.text[:120]}")
        return [], Decimal(0)
    max_deposit = max((c.amount for c in credits), default=Decimal(0))
    print(f"  → {len(credits)} closed lender credits in last {days}d, max deposit ${max_deposit:,.2f}")
    if max_deposit > 0 and max_deposit < LADDER_MIN_AGGRESSIVE:
        print(f"  ⚠️  Max deposit < ${LADDER_MIN_AGGRESSIVE} → ladder NEVER activated for this account.")
        print(f"     All credits are by definition at base tranche (1.0×). Audit can't measure ladder.")
    return credits, max_deposit


async def main_async() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30,
                    help="Days of history to pull (default 30)")
    args = ap.parse_args()

    print(f"=== Quiver real-data ladder fill audit ===")
    print(f"  Pulling last {args.days} days of fUSDT closed credits, all connected accounts.\n")

    frr_by_date = fetch_frr_by_date(args.days)
    print(f"  → {len(frr_by_date)} days of FRR (public market) data")

    # Load all earn_bitfinex_connections
    all_credits: list[Credit] = []
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(EarnBitfinexConnection)
            .join(EarnAccount, EarnAccount.id == EarnBitfinexConnection.earn_account_id)
            .where(EarnBitfinexConnection.revoked_at.is_(None))
        )).scalars().all()
        if not rows:
            print("\n⚠️  No active EarnBitfinexConnection rows. Has any user connected?")
            return
        print(f"  → {len(rows)} active Bitfinex connection(s)")
        max_deposit_overall = Decimal(0)
        n_ladder_capable = 0
        for conn in rows:
            credits, max_deposit = await audit_one_account(db, conn, frr_by_date, args.days)
            all_credits.extend(credits)
            max_deposit_overall = max(max_deposit_overall, max_deposit)
            if max_deposit >= LADDER_MIN_AGGRESSIVE:
                n_ladder_capable += 1

    if not all_credits:
        print("\n⚠️  Zero closed credits across all accounts. Try --days 90 or longer.")
        return

    # Meta-finding: did anyone actually have ladder activate?
    if n_ladder_capable == 0:
        print()
        print("=" * 70)
        print("⚠️  META-FINDING: NO ACCOUNT HAD ENOUGH CAPITAL FOR LADDER")
        print("=" * 70)
        print(f"  Largest single deposit across all users: ${max_deposit_overall:,.2f}")
        print(f"  Aggressive ladder min:  ${LADDER_MIN_AGGRESSIVE}  (smallest tranche 8% × $150 floor)")
        print(f"  Balanced ladder min:    ${LADDER_MIN_BALANCED}  (smallest tranche 3% × $150 floor)")
        print()
        print("  → Every credit in this audit is at the BASE tranche (1.0×) by")
        print("    definition, because Quiver fell back to single-offer mode.")
        print("  → Audit CANNOT validate ladder strategy from prod data alone.")
        print("  → Need a user with ≥ $1,875 (Aggressive) or ≥ $5,000 (Balanced)")
        print("    to deposit and let it run for 30+ days before this audit gives signal.")
        print()
        print("  Falling through to show the data we have anyway (will all bucket as ≈ FRR):")
        print()

    # ── Per-credit analysis
    bucket_counts: dict[str, int] = defaultdict(int)
    bucket_amounts: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    bucket_aprs: dict[str, list[float]] = defaultdict(list)
    bucket_periods: dict[str, list[int]] = defaultdict(list)
    bucket_targets: dict[str, str] = {}

    skipped_no_frr = 0
    for c in all_credits:
        frr = frr_by_date.get(c.date_key)
        if frr is None or frr < 0.001:
            skipped_no_frr += 1
            continue
        mult = c.apr / frr
        label, target = bucket_for_multiplier(mult)
        bucket_counts[label] += 1
        bucket_amounts[label] += c.amount
        bucket_aprs[label].append(c.apr)
        bucket_periods[label].append(c.period_days)
        bucket_targets[label] = target

    if skipped_no_frr:
        print(f"  ({skipped_no_frr} credits skipped — no FRR data for their open date)")

    # ── Output
    total_amount = sum(bucket_amounts.values()) or Decimal(1)
    print(f"\n=== Fill distribution by multiplier bucket ===")
    print(f"  ({sum(bucket_counts.values())} credits, ${total_amount:,.2f} total notional)\n")
    print(f"  {'Bucket':<22s} {'count':>6s} {'$ amount':>12s} {'%$':>6s} {'avg APR':>9s} {'avg days':>9s}  {'target':<28s}")
    print("  " + "─" * 110)

    for label, _, _, _ in BUCKETS:
        n = bucket_counts.get(label, 0)
        amt = bucket_amounts.get(label, Decimal(0))
        pct = float(amt / total_amount * 100)
        aprs = bucket_aprs.get(label, [])
        avg_apr = sum(aprs) / len(aprs) if aprs else 0.0
        periods = bucket_periods.get(label, [])
        avg_days = sum(periods) / len(periods) if periods else 0.0
        target = bucket_targets.get(label, "—")
        bar = "█" * int(pct / 2)
        print(f"  {label:<22s} {n:>6d} ${amt:>11,.2f} {pct:>5.1f}% {avg_apr:>8.2f}% {avg_days:>8.1f}d  {target:<28s} {bar}")

    # ── Verdict
    print()
    print("=== Verdict ===\n")
    high_amount = sum(
        bucket_amounts.get(label, Decimal(0))
        for label, lo, _, _ in BUCKETS
        if lo >= 1.10
    )
    high_count = sum(
        bucket_counts.get(label, 0)
        for label, lo, _, _ in BUCKETS
        if lo >= 1.10
    )

    actual_high_pct = float(high_amount / total_amount * 100)
    target_high_pct = 40.0  # Balanced: 20+10+7+3

    print(f"  Capital in HIGH tranches (≥1.1× FRR):  {actual_high_pct:.1f}%  ({high_count} credits)")
    print(f"  Balanced target:                        {target_high_pct:.1f}%")
    delta = actual_high_pct - target_high_pct
    print(f"  Delta:                                  {delta:+.1f}%\n")

    if actual_high_pct < 10:
        print("  🔴 High tranches barely fill. Backtest's pessimistic fill model is RIGHT.")
        print("     → Action: simplify to 2-3 tier, OR drop ladder entirely (FRR + dynamic period).")
    elif actual_high_pct < 25:
        print("  🟡 Partial fill of high tranches. Ladder gets some spike value below target.")
        print("     → Action: rebalance (less weight on highest mults), or widen price gaps.")
    elif actual_high_pct < 50:
        print("  🟢 High tranches fill close to target. Ladder is roughly working.")
        print("     → Action: backtest model was too pessimistic. Trust production data.")
    else:
        print("  🟢🟢 OVER-fill vs target.")
        print("     Hot market window — overfit risk if you tune ladder to this period.")


if __name__ == "__main__":
    asyncio.run(main_async())
