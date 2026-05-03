"""Public Tron client — fallback when Tatum can't read uninit accounts.

Tatum's `/v3/tron/account/<addr>` returns 403 `tron.account.not.found` for
any address that has never received native TRX, even if it actually holds
TRC-20 tokens. Same chicken-and-egg also bites trongrid's `/v1/accounts/`
(returns empty `data: []` on uninit). The only public source that reliably
returns real balances on uninit addresses is **Tronscan's explorer API**,
which reads via indexer rather than account-state RPC.

Note: Tronscan API is an explorer wrapper, not an official Tron node RPC.
It's stable enough for a read-only fallback but rate-limited; we only call
it when Tatum has already 403'd, so volume stays low.
"""

from __future__ import annotations

from decimal import Decimal

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

TRONSCAN_BASE = "https://apilist.tronscanapi.com"
DEFAULT_TIMEOUT = 10.0


class TronPublicError(Exception):
    """Public Tron API call failed."""


async def _get_account(address: str) -> dict:
    async with httpx.AsyncClient(base_url=TRONSCAN_BASE, timeout=DEFAULT_TIMEOUT) as c:
        res = await c.get(f"/api/account?address={address}")
    if res.status_code >= 400:
        raise TronPublicError(f"tronscan account failed: {res.status_code}")
    try:
        return res.json()
    except ValueError as e:
        raise TronPublicError(f"tronscan returned non-JSON: {e}") from e


async def get_trx_balance_public(address: str) -> Decimal:
    """Read native TRX balance. Works on uninit accounts (returns 0)."""
    body = await _get_account(address)
    raw = body.get("balance", 0)
    return Decimal(int(raw)) / Decimal(1_000_000)


async def get_trc20_balance_public(address: str, contract: str) -> Decimal:
    """Read a single TRC-20 token balance.

    Tronscan returns `trc20token_balances: [{tokenId, balance, tokenDecimal, ...}]`
    where `tokenId` is the contract address.
    """
    body = await _get_account(address)
    for tk in body.get("trc20token_balances", []) or []:
        if tk.get("tokenId") == contract:
            return Decimal(int(tk.get("balance", 0))) / Decimal(10 ** int(tk.get("tokenDecimal", 6)))
    return Decimal("0")
