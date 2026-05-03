"""Public Tron RPC client (trongrid) — fallback when Tatum can't read uninit accounts.

Tatum's `/v3/tron/account/<addr>` returns 403 `tron.account.not.found` for any
Tron address that has never received native TRX, even if it actually holds
TRC-20 tokens. That edge case bites every fresh user who deposits USDT-TRC20
without first being topped up with TRX (which is the normal flow on real
exchanges). See [services/tatum.py:get_trx_balance / get_trc20_balance] —
they fall back here on 403.

Trongrid public API has no such restriction: it returns the real balances
(TRX = 0 + trc20 array populated) for uninit addresses.

We use this only as a fallback path; happy path stays on Tatum so the rest
of the system (subscriptions, broadcasts) keeps the same provider.
"""

from __future__ import annotations

from decimal import Decimal

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

TRONGRID_BASE = "https://api.trongrid.io"
DEFAULT_TIMEOUT = 10.0


class TronPublicError(Exception):
    """Trongrid public API call failed."""


async def get_trx_balance_public(address: str) -> Decimal:
    """Read TRX balance via trongrid. Works on uninit accounts (returns 0)."""
    async with httpx.AsyncClient(base_url=TRONGRID_BASE, timeout=DEFAULT_TIMEOUT) as c:
        res = await c.get(f"/v1/accounts/{address}")
    if res.status_code >= 400:
        raise TronPublicError(f"trongrid get_account failed: {res.status_code}")
    data = res.json().get("data", [])
    if not data:
        # Address exists in our system but has zero on-chain history — truly 0.
        return Decimal("0")
    raw = data[0].get("balance", 0)
    return Decimal(int(raw)) / Decimal(1_000_000)


async def get_trc20_balance_public(address: str, contract: str) -> Decimal:
    """Read a single TRC20 token balance via trongrid.

    Trongrid returns trc20 as a list of single-key dicts: [{contract: "raw"}, ...]
    where raw is the smallest-unit string (USDT has 6 decimals).
    """
    async with httpx.AsyncClient(base_url=TRONGRID_BASE, timeout=DEFAULT_TIMEOUT) as c:
        res = await c.get(f"/v1/accounts/{address}")
    if res.status_code >= 400:
        raise TronPublicError(f"trongrid get_account failed: {res.status_code}")
    data = res.json().get("data", [])
    if not data:
        return Decimal("0")
    for entry in data[0].get("trc20", []) or []:
        if isinstance(entry, dict) and contract in entry:
            return Decimal(int(entry[contract])) / Decimal(10**6)
    return Decimal("0")
