"""
Quiver Earn — PoC Phase 1.5: 多平台 USDT yield 掃描器。

跑這個會即時抓:
- Bitfinex funding market(USDT 借貸 FRR)
- DefiLlama yields API(AAVE / Compound / Spark / JustLend 等所有 DeFi 協議)

目的:讓你一眼看到「有沒有 APY 比 JustLend 1.37% 好的選項」。

Run:
    docker compose exec -T -e PYTHONPATH=/app api python /app/scripts/poc_yield_scanner.py
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

import httpx


@dataclass
class YieldOption:
    platform: str  # "Bitfinex" / "AAVE V3" / etc.
    chain: str  # "CeFi" / "Ethereum" / "Polygon" / "Tron" / etc.
    asset: str  # "USDT" / "USDC" / etc.
    apy_pct: Decimal  # 8.5 = 8.5%
    tvl_usd: Decimal | None  # 流動性,可幫助判斷可吃下多少 deposit
    notes: str = ""

    def __str__(self) -> str:
        tvl_str = (
            f"${self.tvl_usd / 1_000_000:.0f}M" if self.tvl_usd else "—"
        )
        return (
            f"{self.platform:<22} {self.chain:<14} {self.asset:<8}"
            f" {self.apy_pct:>6.2f}%   TVL {tvl_str:<8}  {self.notes}"
        )


# ====================================================================
# Bitfinex funding market — public API,免認證
# ====================================================================

def fetch_bitfinex_funding(symbol: str = "fUST") -> YieldOption | None:
    """從 Bitfinex 的 funding ticker 抓 FRR(Flash Return Rate)。

    https://api-pub.bitfinex.com/v2/ticker/fUSDT 回 array:
    [FRR, BID, BID_PERIOD, BID_SIZE, ASK, ASK_PERIOD, ASK_SIZE,
     DAILY_CHANGE, DAILY_CHANGE_PERC, LAST_PRICE, VOLUME, HIGH, LOW,
     _, _, FRR_AMOUNT_AVAILABLE]

    FRR 單位:per day(日利率)。年化 APY = FRR × 365(simple)。
    """
    # 注意:Bitfinex 用 'UST' 表示 Tether USDT(不是 'USDT'),所以 funding symbol 是 fUST
    url = f"https://api-pub.bitfinex.com/v2/ticker/{symbol}"
    try:
        r = httpx.get(url, timeout=10.0)
        r.raise_for_status()
        data = r.json()
        frr = Decimal(str(data[0]))  # 日利率
        # 簡單年化(Bitfinex 自己就是這樣顯示)
        apy = frr * 365 * 100  # 換成百分比
        bid = Decimal(str(data[1]))  # 借方願意付的最高利率
        ask = Decimal(str(data[4]))  # 出借方願意收的最低利率
        last = Decimal(str(data[9]))  # 最近成交利率
        last_apy = last * 365 * 100
        # 平均借出時長(天)
        ask_period = data[5]
        notes = (
            f"period {ask_period}d, last {last_apy:.2f}% APY"
        )
        # Bitfinex 'UST' = Tether USDT,顯示時還原成 USDT 比較直觀
        asset_display = "USDT" if symbol == "fUST" else symbol[1:]
        return YieldOption(
            platform="Bitfinex Funding",
            chain="CeFi",
            asset=asset_display,
            apy_pct=apy,
            tvl_usd=None,  # ticker 沒給,要從 funding stats endpoint 拿
            notes=notes,
        )
    except Exception as e:
        print(f"  ⚠ Bitfinex {symbol} fetch failed: {e}")
        return None


# ====================================================================
# DefiLlama yields API — 一次抓全部 DeFi 協議的 APY,免認證
# ====================================================================

def fetch_defillama_top_usdt(top_n: int = 20) -> list[YieldOption]:
    """https://yields.llama.fi/pools 一次回所有協議的 yield pool。

    我們 filter:USDT、TVL > $10M、安全 tier(主流協議)。
    """
    url = "https://yields.llama.fi/pools"
    try:
        r = httpx.get(url, timeout=15.0)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  ⚠ DefiLlama fetch failed: {e}")
        return []

    pools = data.get("data", [])
    # filter:單一資產 = USDT,TVL ≥ $10M
    # 排除 farming / leveraged / IL 等高風險策略
    filtered = []
    for p in pools:
        if p.get("symbol") != "USDT":
            continue
        tvl = p.get("tvlUsd") or 0
        if tvl < 10_000_000:
            continue
        # 排除明顯高風險的(IL>0、leverage 等)
        if p.get("ilRisk") == "yes":
            continue
        if p.get("exposure") != "single":
            continue
        # APY = base apy + reward apy(reward 多半是 protocol 代幣 incentives)
        apy_base = p.get("apyBase") or 0
        apy_reward = p.get("apyReward") or 0
        apy = (apy_base or 0) + (apy_reward or 0)
        if apy <= 0:
            continue
        notes = ""
        if apy_reward and apy_reward > 0:
            notes = f"({apy_base:.1f}% base + {apy_reward:.1f}% reward)"
        # 取主流協議
        project = p.get("project", "")
        if any(
            tag in project.lower()
            for tag in ["aave", "compound", "spark", "morpho", "fluid", "venus", "justlend", "yearn"]
        ):
            filtered.append(
                YieldOption(
                    platform=f"{project}",
                    chain=p.get("chain", "—"),
                    asset="USDT",
                    apy_pct=Decimal(str(apy)),
                    tvl_usd=Decimal(str(tvl)),
                    notes=notes,
                )
            )

    # 按 APY 排序,取前 N
    filtered.sort(key=lambda x: x.apy_pct, reverse=True)
    return filtered[:top_n]


# ====================================================================
# Main
# ====================================================================

def main() -> None:
    print("=" * 90)
    print("Quiver Earn — Multi-Platform USDT Yield Scanner")
    print("=" * 90)
    print(f"{'Platform':<22} {'Chain':<14} {'Asset':<8} {'APY':>7}    {'TVL':<11}  Notes")
    print("-" * 90)

    options: list[YieldOption] = []

    # 1. Bitfinex (CeFi)
    # 注意:Bitfinex 用 'fUST' 代表 Tether,不是 'fUSDT'(歷史遺留)
    print("\n— CeFi —")
    bf_ust = fetch_bitfinex_funding("fUST")
    if bf_ust:
        print(bf_ust)
        options.append(bf_ust)
    bf_usd = fetch_bitfinex_funding("fUSD")
    if bf_usd:
        print(bf_usd)
        options.append(bf_usd)

    # 2. DeFi top pools
    print("\n— DeFi (DefiLlama,只列主流協議 + TVL > $10M + USDT) —")
    defi = fetch_defillama_top_usdt(top_n=15)
    for o in defi:
        print(o)
        options.append(o)

    # ====================================================================
    # 對比 + 結論
    # ====================================================================
    print("\n" + "=" * 90)
    print("結論")
    print("=" * 90)

    options.sort(key=lambda x: x.apy_pct, reverse=True)
    if not options:
        print("✗ 沒抓到任何選項")
        return

    print(f"\n當下 USDT yield 排行(全平台):")
    for i, opt in enumerate(options[:10], 1):
        print(f"  {i}. {opt}")

    best = options[0]
    print(f"\n→ 最高 APY:{best.platform} on {best.chain} = {best.apy_pct:.2f}%")

    # 幾個關鍵 benchmark
    print(f"\nBenchmark 對比:")
    benchmarks = [
        ("台灣郵局活儲", Decimal("0.5")),
        ("台灣銀行 1 年定存", Decimal("1.6")),
        ("JustLend USDT (剛剛 PoC)", Decimal("1.37")),
        ("Quiver 抽 15% 後保本門檻", Decimal("3")),  # 用戶 net = APY × 0.85,要 > 2.55% 才比定存高
    ]
    for name, rate in benchmarks:
        better = [o for o in options if o.apy_pct > rate]
        print(f"  > {name} ({rate}%): {len(better)} 個選項贏")

    # Quiver 抽 15% 後 net APY
    print(f"\nQuiver 抽 15% perf fee 後,用戶 net APY:")
    for o in options[:5]:
        net = o.apy_pct * Decimal("0.85")
        bench = "✓" if net > Decimal("1.6") else "✗"
        print(f"  {o.platform:<22} gross {o.apy_pct:>5.2f}% → net {net:>5.2f}% {bench} (vs 定存 1.6%)")


if __name__ == "__main__":
    main()
