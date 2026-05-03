"""Subscription policy constants — F-4c.

Single source of truth for plan price, period length, and grace window.
"""

from __future__ import annotations

from decimal import Decimal


# ─────────────────────────────────────────────────────────
# Plans
# ─────────────────────────────────────────────────────────

# V1: one plan only. Future tiers (e.g., $4.99 → friend rate / $14.99 →
# institutional features) just add new entries here.
PREMIUM_MONTHLY_PRICE_USDT = Decimal("9.99")

# Period length is calendar-month-ish: subscribe on day-of-month X → renew on
# day-of-month X next month. Stored as 30 days for simplicity (avoids
# month-length edge cases like Feb 30).
PERIOD_DAYS = 30


# ─────────────────────────────────────────────────────────
# Grace window
# ─────────────────────────────────────────────────────────

# When auto-renewal fails (insufficient balance), sub goes to PAST_DUE for
# this many days. During PAST_DUE the user still gets premium benefits
# (0% perf fee). After this, status becomes EXPIRED and benefits stop.
PAST_DUE_GRACE_DAYS = 7
