"""Referral system constants — F-4b.

Single source of truth for:
  - Revshare rates (L1 = 10%, L2 = 5% of perf_fee)
  - Window (6 months from invitee's first perf_fee accrual)
  - Code format + reserved words
  - Min payout threshold
"""

from __future__ import annotations

import re
from decimal import Decimal


# ─────────────────────────────────────────────────────────
# Revshare rates (in basis points of perf_fee, NOT of underlying interest)
# ─────────────────────────────────────────────────────────

L1_REVSHARE_BPS = 1000   # 10% of perf_fee → direct referrer
L2_REVSHARE_BPS = 500    # 5% of perf_fee → grandparent referrer

# Quiver retains: perf_fee × (1 - 0.10 - 0.05) = perf_fee × 0.85 when both
# levels are active. Public-tier user (perf_fee=15% of interest) with both
# levels → Quiver keeps 12.75% of interest, L1 1.5%, L2 0.75%.

REVSHARE_WINDOW_DAYS = 180  # 6 months from invitee's first perf_fee accrual


# ─────────────────────────────────────────────────────────
# Min payout threshold
# ─────────────────────────────────────────────────────────

# Skip revshare payout if computed amount is below this. Avoids dust ledger
# entries (and rounding-zero amounts that ledger.post_referral_payout would
# reject).
MIN_PAYOUT_USDT = Decimal("0.01")


# ─────────────────────────────────────────────────────────
# Code format
# ─────────────────────────────────────────────────────────

CODE_MIN_LEN = 4
CODE_MAX_LEN = 12
CODE_REGEX = re.compile(rf"^[A-Z0-9]{{{CODE_MIN_LEN},{CODE_MAX_LEN}}}$")

# Reserved codes — prevents impersonation / squatting on Quiver brand /
# generic-sounding moderator handles. Compared after uppercasing.
RESERVED_CODES = frozenset(
    {
        "ADMIN",
        "ROOT",
        "QUIVER",
        "QUIVERDEFI",
        "SUPPORT",
        "HELP",
        "MOD",
        "STAFF",
        "OFFICIAL",
        "TEST",
        "TESTING",
        "DEMO",
        "NULL",
        "NONE",
        "ANON",
        "ANONYMOUS",
        "SYSTEM",
        "API",
        "WWW",
        "ROOT",
    }
)


def normalize_code(raw: str) -> str:
    """Strip whitespace + uppercase. Returns the canonical form for storage
    and comparison."""
    return raw.strip().upper()


def is_valid_code(code: str) -> bool:
    """True if `code` (already normalized) matches format + isn't reserved."""
    if not CODE_REGEX.fullmatch(code):
        return False
    if code in RESERVED_CODES:
        return False
    return True
