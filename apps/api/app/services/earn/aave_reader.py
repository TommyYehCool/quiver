"""AAVE V3 Polygon read-only — 從 PoC #1 提煉。

支援:
- 讀任意 EOA 在 aPolUSDT 的餘額
- 讀當前 supply rate (APR / APY)

Phase 1 純讀,write(supply / withdraw)留 V0.5 platform mode。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from decimal import Decimal, getcontext

import httpx

from app.core.logging import get_logger

getcontext().prec = 50

logger = get_logger(__name__)

# Polygon mainnet public RPC fallbacks
RPC_URLS = [
    "https://polygon.drpc.org",
    "https://1rpc.io/matic",
    "https://polygon.publicnode.com",
    "https://rpc.ankr.com/polygon",
]

# AAVE V3 Polygon contracts
POOL_ADDRESS = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"
USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
ATOKEN_USDT = "0x6ab707Aca953eDAeFBc4fD23bA73294241490620"

GET_RESERVE_DATA_SELECTOR = "0x35ea6a75"  # getReserveData(address)
BALANCE_OF_SELECTOR = "0x70a08231"  # balanceOf(address)

RAY = Decimal(10) ** 27
SECONDS_PER_YEAR = 31_536_000
SLOT_HEX = 64


# ─────────────────────────────────────────────────────────


@dataclass(frozen=True)
class AaveSupplyInfo:
    apr: Decimal  # 0.038 = 3.8%
    apy: Decimal  # per-second compounded


@dataclass(frozen=True)
class AaveUserPosition:
    address: str
    atoken_balance: Decimal  # USDT 等值(decimals=6 已處理)


# ─────────────────────────────────────────────────────────


def _encode_address(addr: str) -> str:
    addr_clean = addr.lower().removeprefix("0x")
    if len(addr_clean) != 40:
        raise ValueError(f"bad address: {addr}")
    return addr_clean.rjust(SLOT_HEX, "0")


async def _eth_call(to: str, data: str) -> str:
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [{"to": to, "data": data}, "latest"],
        "id": 1,
    }
    last_err: Exception | None = None
    async with httpx.AsyncClient() as client:
        for url in RPC_URLS:
            try:
                r = await client.post(url, json=payload, timeout=10.0)
                r.raise_for_status()
                j = r.json()
                if "error" in j:
                    raise RuntimeError(f"RPC error: {j['error']}")
                return j["result"]
            except Exception as e:
                last_err = e
                continue
    raise RuntimeError(f"all RPCs failed: {last_err}")


def _apr_to_apy(apr: Decimal) -> Decimal:
    """per-second compounding。對 < 10% 級別差異 < 0.3% absolute。"""
    n = SECONDS_PER_YEAR
    rate_per_sec = apr / Decimal(n)
    base = Decimal(1) + rate_per_sec
    return base ** n - Decimal(1)


# ─────────────────────────────────────────────────────────


async def get_supply_info() -> AaveSupplyInfo:
    """讀 AAVE V3 Polygon USDT (PoS) supply rate。"""
    data = GET_RESERVE_DATA_SELECTOR + _encode_address(USDT_ADDRESS)
    raw = await _eth_call(POOL_ADDRESS, data)
    # slot 2 = currentLiquidityRate (uint128 in ray)
    cleaned = raw.removeprefix("0x")
    slot2 = cleaned[2 * SLOT_HEX : 3 * SLOT_HEX]
    rate_ray = Decimal(int(slot2, 16))
    apr = rate_ray / RAY
    apy = _apr_to_apy(apr)
    return AaveSupplyInfo(apr=apr, apy=apy)


async def get_user_atoken_balance(evm_address: str) -> Decimal:
    """讀某地址在 aPolUSDT 的餘額(換成 USDT,decimals=6)。"""
    data = BALANCE_OF_SELECTOR + _encode_address(evm_address)
    raw = await _eth_call(ATOKEN_USDT, data)
    raw_int = int(raw, 16)
    return Decimal(raw_int) / Decimal(10**6)


async def get_user_position(evm_address: str) -> AaveUserPosition:
    bal = await get_user_atoken_balance(evm_address)
    return AaveUserPosition(address=evm_address, atoken_balance=bal)
