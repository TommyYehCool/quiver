"""
Quiver Earn — PoC Phase 1: JustLend mainnet read-only investigation.

Goals:
- Verify our hypothesis on contract addresses works
- Confirm we can read JustLend state(rate, APY, TVL, utilization)
- No state changes, no signing, no money

Why httpx + Tatum instead of tronpy:
- Public TronGrid endpoint rate-limits aggressively(429 after 2-3 calls)
- We have a paid Tatum mainnet key, so use Tatum's Tron RPC node passthrough
- For read-only view methods returning uint256 we don't need full ABI encoding;
  hex decoding is straightforward

Run:
    docker compose exec api python /app/scripts/poc_justlend_readonly.py
"""

from __future__ import annotations

import os
from decimal import Decimal

import httpx

# =====================================================================
# JustLend mainnet contract addresses
# 上線前再 cross-verify(防被釣魚地址 hijack):
#   - https://docs.justlend.org/the-architecture-of-justlend-protocol/contracts
#   - https://defillama.com/protocol/justlend
#   - https://tronscan.io/#/contract/<addr>(看 verified contract code)
# =====================================================================
JLEND_JUSDT = "TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd"
USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

# Tron 約 3 秒一塊 → 一年 ≈ 10.5M blocks
BLOCKS_PER_YEAR = 10_512_000

# Tatum proxy endpoint:用我們的付費 key,沒有 trongrid 的 rate limit 問題
TATUM_BASE = os.environ.get("TATUM_BASE_URL", "https://api.tatum.io")
TATUM_KEY = os.environ.get("TATUM_API_KEY_MAINNET", "")
TATUM_NODE_RPC = f"{TATUM_BASE}/v3/blockchain/node/tron-mainnet"

# 任意 owner address(僅作 RPC 必填欄位,不會動到他)
DUMMY_OWNER = "TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy"


def trigger_constant(
    contract_address: str, function_selector: str, parameter: str = ""
) -> str:
    """Call Tron's triggerconstantcontract via Tatum proxy。
    Returns the constant_result[0] hex string(uint256 等簡單型別好處理)。"""
    payload = {
        "owner_address": DUMMY_OWNER,
        "contract_address": contract_address,
        "function_selector": function_selector,
        "parameter": parameter,
        "fee_limit": 100_000_000,
        "call_value": 0,
        "visible": True,
    }
    headers = {"x-api-key": TATUM_KEY, "Content-Type": "application/json"}
    r = httpx.post(
        f"{TATUM_NODE_RPC}/wallet/triggerconstantcontract",
        json=payload,
        headers=headers,
        timeout=15.0,
    )
    r.raise_for_status()
    body = r.json()
    if "result" in body and not body["result"].get("result"):
        raise RuntimeError(f"trigger failed: {body}")
    cr = body.get("constant_result") or []
    if not cr:
        raise RuntimeError(f"no constant_result: {body}")
    return cr[0]


def hex_to_uint(hex_str: str) -> int:
    """uint256 = 32 bytes = 64 hex chars。Tatum 回的有時是 192 chars
    (3 個 uint256 concatenated),value 是**第一個** 64-char chunk。"""
    if not hex_str:
        return 0
    cleaned = hex_str.replace("0x", "")
    if len(cleaned) > 64:
        cleaned = cleaned[:64]
    return int(cleaned, 16)


def hex_to_address(hex_str: str) -> str:
    """ABI return uint256 → Tron base58 地址。
    Tron 地址在 ABI return 是 32-byte 0-padded,取最後 20 bytes,前面加 0x41 byte。"""
    raw = "41" + hex_str[-40:]
    return _base58check(bytes.fromhex(raw))


def hex_to_string(hex_str: str) -> str:
    """ABI string 解碼:[offset 32B][len 32B][data ...]。"""
    if not hex_str or len(hex_str) < 128:
        return ""
    length = int(hex_str[64:128], 16)
    data = hex_str[128 : 128 + length * 2]
    try:
        return bytes.fromhex(data).decode("utf-8").rstrip("\x00")
    except Exception:
        return f"<binary {data[:20]}...>"


def _base58check(data: bytes) -> str:
    """Tron Base58Check(SHA256 雙雜湊取前 4 bytes 當 checksum)。"""
    import hashlib

    checksum = hashlib.sha256(hashlib.sha256(data).digest()).digest()[:4]
    payload = data + checksum
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    n = int.from_bytes(payload, "big")
    out = ""
    while n > 0:
        n, r = divmod(n, 58)
        out = alphabet[r] + out
    pad = 0
    for b in payload:
        if b == 0:
            pad += 1
        else:
            break
    return "1" * pad + out


def hr(title: str) -> None:
    print(f"\n--- {title} ---")


def main() -> None:
    print("=" * 60)
    print("Quiver Earn — JustLend Mainnet Read-only PoC")
    print("=" * 60)
    print(f"Endpoint: {TATUM_NODE_RPC}")
    print(f"Has Tatum mainnet key: {bool(TATUM_KEY)}")
    print()

    if not TATUM_KEY:
        print("✗ TATUM_API_KEY_MAINNET 未設定")
        return

    hr("Basic Info")
    try:
        sym_hex = trigger_constant(JLEND_JUSDT, "symbol()")
        symbol = hex_to_string(sym_hex)
        print(f"  symbol():     {symbol}")

        dec_hex = trigger_constant(JLEND_JUSDT, "decimals()")
        decimals = hex_to_uint(dec_hex)
        print(f"  decimals():   {decimals}")

        und_hex = trigger_constant(JLEND_JUSDT, "underlying()")
        underlying = hex_to_address(und_hex)
        print(f"  underlying(): {underlying}")
        if underlying.lower() == USDT_TRC20.lower():
            print(f"  ✓ underlying = USDT_TRC20 — 確認是 jUSDT")
        else:
            print(f"  ⚠ underlying ≠ USDT_TRC20,可能不是 jUSDT,中止")
            return
    except Exception as e:
        print(f"  ✗ basic info failed: {e}")
        return

    hr("Exchange Rate")
    try:
        rate_hex = trigger_constant(JLEND_JUSDT, "exchangeRateStored()")
        rate = hex_to_uint(rate_hex)
        rate_scale = 10 ** (18 + 6 - decimals)  # USDT 6 dec, jUSDT 8 dec → scale=1e16
        usdt_per = Decimal(rate) / Decimal(rate_scale)
        print(f"  raw stored rate:  {rate}")
        print(f"  USDT per 1 jUSDT: {usdt_per:.10f}")
    except Exception as e:
        print(f"  ✗ exchangeRateStored failed: {e}")

    hr("Supply APY (關鍵,用戶能拿多少)")
    try:
        spr_hex = trigger_constant(JLEND_JUSDT, "supplyRatePerBlock()")
        spr = hex_to_uint(spr_hex)
        apy_per_block = Decimal(spr) / Decimal(10**18)
        apy = (1 + apy_per_block) ** BLOCKS_PER_YEAR - 1
        print(f"  supplyRatePerBlock: {spr}")
        print(f"  Implied APY:        {apy * 100:.2f}%")
        if apy > 0:
            user_net = apy * Decimal("0.85")  # Quiver 抽 15%
            print(
                f"  → Quiver 抽 15% perf fee 後 net APY: {user_net * 100:.2f}%"
            )
    except Exception as e:
        print(f"  ✗ supplyRatePerBlock failed: {e}")

    hr("Borrow APY (對照)")
    try:
        bpr_hex = trigger_constant(JLEND_JUSDT, "borrowRatePerBlock()")
        bpr = hex_to_uint(bpr_hex)
        bapy = (1 + Decimal(bpr) / Decimal(10**18)) ** BLOCKS_PER_YEAR - 1
        print(f"  Borrow APY: {bapy * 100:.2f}%")
    except Exception as e:
        print(f"  ✗ borrowRatePerBlock failed: {e}")

    hr("TVL")
    cash = borrows = None
    try:
        cash = hex_to_uint(trigger_constant(JLEND_JUSDT, "getCash()"))
        borrows = hex_to_uint(trigger_constant(JLEND_JUSDT, "totalBorrows()"))
        reserves = hex_to_uint(trigger_constant(JLEND_JUSDT, "totalReserves()"))
        tvl = (cash + borrows - reserves) / 10**6
        print(f"  Cash:     ${cash / 10**6:>15,.0f}")
        print(f"  Borrows:  ${borrows / 10**6:>15,.0f}")
        print(f"  Reserves: ${reserves / 10**6:>15,.0f}")
        print(f"  TVL:      ${tvl:>15,.0f}")
    except Exception as e:
        print(f"  ✗ TVL failed: {e}")

    hr("Utilization")
    try:
        if cash is not None and borrows is not None and (cash + borrows) > 0:
            util = Decimal(borrows) / Decimal(cash + borrows)
            print(f"  Utilization: {util * 100:.1f}%")
            if util > Decimal("0.95"):
                print(f"  ⚠ utilization 過高,贖回可能延遲")
    except Exception as e:
        print(f"  ✗ utilization failed: {e}")

    hr("jUSDT Total Supply")
    try:
        ts_hex = trigger_constant(JLEND_JUSDT, "totalSupply()")
        ts = hex_to_uint(ts_hex)
        print(f"  Total jUSDT issued: {ts / 10**decimals:,.4f}")
    except Exception as e:
        print(f"  ✗ totalSupply failed: {e}")

    hr("Reserve Factor")
    try:
        rf_hex = trigger_constant(JLEND_JUSDT, "reserveFactorMantissa()")
        rf = hex_to_uint(rf_hex)
        rf_pct = Decimal(rf) / Decimal(10**18)
        print(f"  Reserve factor: {rf_pct * 100:.0f}%")
        print(f"  → 這 % 的利息歸協議,supplier 拿剩下的")
    except Exception as e:
        print(f"  ✗ reserveFactorMantissa failed: {e}")

    print("\n" + "=" * 60)
    print("PoC Phase 1 complete.")
    print("=" * 60)


if __name__ == "__main__":
    main()
