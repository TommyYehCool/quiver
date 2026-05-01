"""
Quiver Earn — PoC Phase 3 #1: AAVE V3 Polygon read-only。

驗證:
- 用 raw JSON-RPC (eth_call) 直接讀 AAVE V3 Polygon 的 USDT supply rate
- 不需要 web3.py,純 httpx + ABI 手 decode
- 跟 DefiLlama 給的 APY 對齊驗證準確性

關鍵 contract:
- Pool (V3 Polygon):   0x794a61358D6845594F94dc1DB02A252b5b4814aD
- USDT (Polygon):      0xc2132D05D31c914a87C6611C10748AEb04B58e8F
- aPolUSDT (我們存進去拿到的 receipt token): 0x6ab707Aca953eDAeFBc4fD23bA73294241490620

ReserveData struct (AAVE V3):
  slot 0: configuration (uint256, packed flags)
  slot 1: liquidityIndex (uint128)        ← 累積 index
  slot 2: currentLiquidityRate (uint128)  ← supply APR in ray
  slot 3: variableBorrowIndex
  slot 4: currentVariableBorrowRate
  slot 5: currentStableBorrowRate
  slot 6: lastUpdateTimestamp (uint40)
  slot 7: id (uint16)
  slot 8: aTokenAddress (address)
  slot 9: stableDebtTokenAddress
  slot 10: variableDebtTokenAddress
  slot 11: interestRateStrategyAddress
  slot 12: accruedToTreasury
  slot 13: unbacked
  slot 14: isolationModeTotalDebt

每個 slot 在 ABI return data 裡都是 32 bytes (64 hex chars)。

Run:
    docker compose exec -T -e PYTHONPATH=/app api python /app/scripts/poc_aave_polygon.py
"""

from __future__ import annotations

from decimal import Decimal, getcontext

import httpx

getcontext().prec = 50

# Polygon mainnet public RPC (試多個 fallback)
RPC_URLS = [
    "https://polygon.drpc.org",
    "https://1rpc.io/matic",
    "https://polygon.publicnode.com",
    "https://rpc.ankr.com/polygon",
]

# AAVE V3 Polygon
POOL_ADDRESS = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"
USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
ATOKEN_USDT = "0x6ab707Aca953eDAeFBc4fD23bA73294241490620"

# function selector for getReserveData(address)
GET_RESERVE_DATA_SELECTOR = "0x35ea6a75"

# Constants
RAY = Decimal(10) ** 27  # AAVE 利率單位
SECONDS_PER_YEAR = 31_536_000  # 365 * 24 * 3600
SLOT_BYTES = 32
SLOT_HEX = SLOT_BYTES * 2  # 64 hex chars


def eth_call(to: str, data: str, block: str = "latest") -> str:
    """送 eth_call,試多個 RPC fallback,回傳 hex 字串(0x-prefixed)。"""
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [{"to": to, "data": data}, block],
        "id": 1,
    }
    last_err: Exception | None = None
    for url in RPC_URLS:
        try:
            r = httpx.post(url, json=payload, timeout=10.0)
            r.raise_for_status()
            j = r.json()
            if "error" in j:
                raise RuntimeError(f"RPC error: {j['error']}")
            # 成功,把這個 url 印出來給人看
            eth_call.last_rpc_url = url  # type: ignore[attr-defined]
            return j["result"]
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"all RPCs failed, last error: {last_err}")


def encode_address_arg(addr: str) -> str:
    """把 address 轉成 32-byte zero-padded 的 hex(不帶 0x)。"""
    addr_clean = addr.lower().removeprefix("0x")
    if len(addr_clean) != 40:
        raise ValueError(f"bad address: {addr}")
    return addr_clean.rjust(SLOT_HEX, "0")


def parse_slot(hex_data: str, slot_idx: int) -> int:
    """從 ABI-encoded return data 取第 N 個 32-byte slot (uint256)。"""
    cleaned = hex_data.removeprefix("0x")
    start = slot_idx * SLOT_HEX
    end = start + SLOT_HEX
    if end > len(cleaned):
        raise ValueError(f"slot {slot_idx} out of range, data len={len(cleaned)}")
    return int(cleaned[start:end], 16)


def parse_address(hex_data: str, slot_idx: int) -> str:
    """從第 N 個 slot 取 address(後 40 hex chars)。"""
    cleaned = hex_data.removeprefix("0x")
    start = slot_idx * SLOT_HEX
    slot = cleaned[start : start + SLOT_HEX]
    return "0x" + slot[-40:]


def apr_to_apy(apr_dec: Decimal) -> Decimal:
    """APR (annual rate as decimal) → APY using continuous compounding approx
    (precise per-second compounding)。

    APY = (1 + APR/N)^N - 1 where N = seconds per year
    對小利率(< 10%)幾乎跟 APR 一樣,差異 < 0.3% absolute。
    """
    n = SECONDS_PER_YEAR
    rate_per_sec = apr_dec / Decimal(n)
    # (1 + r)^n via Decimal: 用 ln + exp 避免 huge integer
    # 簡化:對小利率,APY ≈ APR + APR^2/2 + ...
    # 但我們直接用 (1+r)^n,Decimal 處理得來
    base = Decimal(1) + rate_per_sec
    apy = base ** n - Decimal(1)
    return apy


def fetch_reserve_data() -> dict:
    """讀 AAVE V3 Pool.getReserveData(USDT)。"""
    data = GET_RESERVE_DATA_SELECTOR + encode_address_arg(USDT_ADDRESS)
    raw = eth_call(POOL_ADDRESS, data)
    # Parse struct
    return {
        "configuration": parse_slot(raw, 0),
        "liquidityIndex": parse_slot(raw, 1),
        "currentLiquidityRate": parse_slot(raw, 2),
        "variableBorrowIndex": parse_slot(raw, 3),
        "currentVariableBorrowRate": parse_slot(raw, 4),
        "currentStableBorrowRate": parse_slot(raw, 5),
        "lastUpdateTimestamp": parse_slot(raw, 6),
        "id": parse_slot(raw, 7),
        "aTokenAddress": parse_address(raw, 8),
        "stableDebtTokenAddress": parse_address(raw, 9),
        "variableDebtTokenAddress": parse_address(raw, 10),
        "interestRateStrategyAddress": parse_address(raw, 11),
        "accruedToTreasury": parse_slot(raw, 12),
        "unbacked": parse_slot(raw, 13),
        "isolationModeTotalDebt": parse_slot(raw, 14),
    }


def fetch_atoken_total_supply() -> Decimal:
    """讀 aPolUSDT.totalSupply() = AAVE 上 USDT 的總 deposit(USDT decimals = 6)。"""
    # totalSupply() selector = 0x18160ddd
    raw = eth_call(ATOKEN_USDT, "0x18160ddd")
    raw_int = int(raw, 16)
    return Decimal(raw_int) / Decimal(10**6)  # USDT 6 decimals


def fetch_defillama_aave_polygon_usdt_pools() -> list[dict]:
    """從 DefiLlama 抓所有 AAVE V3 Polygon 上 USDT-類 pool(USDT / USDT0)。"""
    url = "https://yields.llama.fi/pools"
    try:
        r = httpx.get(url, timeout=15.0)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  ⚠ DefiLlama fetch failed: {e}")
        return []

    pools = data.get("data", [])
    hits = []
    for p in pools:
        if p.get("project") != "aave-v3":
            continue
        if p.get("chain") != "Polygon":
            continue
        symbol = (p.get("symbol") or "").upper()
        if "USDT" not in symbol:
            continue
        hits.append(
            {
                "symbol": p.get("symbol"),
                "apy": p.get("apy"),
                "apyBase": p.get("apyBase"),
                "apyReward": p.get("apyReward"),
                "tvl": p.get("tvlUsd"),
                "pool_id": p.get("pool"),
            }
        )
    return hits


def main() -> None:
    print("=" * 78)
    print("Quiver Earn PoC #1 — AAVE V3 Polygon (USDT) read-only")
    print("=" * 78)

    print(f"\nRPC候選: {', '.join(RPC_URLS)}")
    print(f"Pool:    {POOL_ADDRESS}")
    print(f"USDT:    {USDT_ADDRESS}")

    # 1. Read reserve data
    print("\n— 讀 Pool.getReserveData(USDT) —")
    try:
        rd = fetch_reserve_data()
        used = getattr(eth_call, "last_rpc_url", "?")
        print(f"  ✓ 用 RPC: {used}")
    except Exception as e:
        print(f"  ✗ failed: {e}")
        return

    # 2. Compute APR / APY
    rate_ray = Decimal(rd["currentLiquidityRate"])
    apr = rate_ray / RAY  # decimal (e.g. 0.049)
    apr_pct = apr * 100  # percent

    print(f"  currentLiquidityRate (ray):  {rd['currentLiquidityRate']:>30,}")
    print(f"  → APR:                       {apr_pct:>30.4f}%")

    apy = apr_to_apy(apr)
    apy_pct = apy * 100
    print(f"  → APY (per-second compound): {apy_pct:>30.4f}%")

    # 3. Sanity check aToken address matches our hardcoded constant
    print(f"\n— Sanity checks —")
    contract_atoken = rd["aTokenAddress"].lower()
    expected_atoken = ATOKEN_USDT.lower()
    if contract_atoken == expected_atoken:
        print(f"  ✓ aTokenAddress 與我們的常數一致 ({ATOKEN_USDT})")
    else:
        print(f"  ⚠ aTokenAddress mismatch!")
        print(f"     contract:  {contract_atoken}")
        print(f"     expected:  {expected_atoken}")

    # 4. aToken total supply = total USDT deposited
    print("\n— 讀 aPolUSDT.totalSupply() = AAVE 上 USDT 總 deposit —")
    try:
        total_usdt = fetch_atoken_total_supply()
        print(f"  總 deposit:  {total_usdt:>20,.2f} USDT")
        print(f"  ≈           ${total_usdt:>20,.0f}")
    except Exception as e:
        print(f"  ✗ failed: {e}")

    # 5. Compare with DefiLlama
    print("\n— DefiLlama 上 AAVE V3 Polygon 所有 USDT-類 pools —")
    dl_pools = fetch_defillama_aave_polygon_usdt_pools()
    if not dl_pools:
        print("  ⚠ DefiLlama 沒列任何 USDT 類 pool")
    else:
        for p in dl_pools:
            apy = Decimal(str(p["apy"]))
            base = Decimal(str(p.get("apyBase") or 0))
            reward = Decimal(str(p.get("apyReward") or 0))
            tvl = Decimal(str(p["tvl"]))
            print(
                f"  symbol={p['symbol']:<8} apy={apy:>5.2f}% "
                f"(base {base:>5.2f}% + reward {reward:>5.2f}%) "
                f"tvl ${tvl/1_000_000:>6.2f}M"
            )

        # 對齊比對:看哪個 pool base APY 最接近我們鏈上算的
        chain_apy = apy_pct
        best_match = min(
            dl_pools,
            key=lambda p: abs(chain_apy - Decimal(str(p.get("apyBase") or 0))),
        )
        match_apy = Decimal(str(best_match.get("apyBase") or 0))
        diff = abs(chain_apy - match_apy)
        print(
            f"\n  最接近我們鏈上 {chain_apy:.4f}% 的是 "
            f"{best_match['symbol']} ({match_apy:.4f}%, diff {diff:.4f}%)"
        )
        if diff < Decimal("0.5"):
            print("  ✓ 差距 < 0.5%,ABI decode 正確")
        else:
            print("  ⚠ 差距 > 0.5%,要除錯")

    # 6. 提醒:我們讀的 USDT_ADDRESS vs DefiLlama 列的 USDT0
    print(
        "\n  ⚠️ 注意:Polygon 的 'USDT' 有兩種:"
        "\n     - PoS bridged USDT (我們讀的, 0xc213...8e8F),老版,但 AAVE 還在用"
        "\n     - USDT0 (LayerZero/Tether 官方原生),新版,DefiLlama 主推"
        "\n     V0.5 production 要決定支援哪一個(或兩個都支援)"
    )

    # 7. Summary
    print("\n" + "=" * 78)
    print("結論")
    print("=" * 78)
    print(f"AAVE V3 Polygon USDT (PoS) supply APY (chain):  {apy_pct:.4f}%")
    if dl_pools:
        # 用最接近的 pool 算 net
        match_total = Decimal(str(best_match["apy"]))
        net_after_perf = match_total * Decimal("0.85")
        print(f"DefiLlama '{best_match['symbol']}' 總 APY (含 reward): {match_total:.4f}%")
        print(f"扣 15% Quiver perf fee 後 net:                  {net_after_perf:.4f}%")
        print(
            f"vs 台灣銀行 1 年定存 1.6%:                        "
            f"{'✓ 贏' if net_after_perf > Decimal('1.6') else '✗ 輸'}"
        )


if __name__ == "__main__":
    main()
