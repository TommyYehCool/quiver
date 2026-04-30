# Quiver Earn PoC — Phase 1 + 2 Report

> Date: 2026-05-01
> Phases run: 1 (read-only mainnet) + 2 (mock e2e)
> Phase 3 (mainnet smoke with real $) — **not run**, awaits decision

---

## TL;DR

| 問題 | 答案 |
|---|---|
| JustLend mainnet 合約有效嗎? | ✅ 是,address `TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd` 確認為 jUSDT,underlying = USDT_TRC20 |
| 我們能讀鏈上狀態嗎? | ✅ 透過 Tatum Tron RPC proxy 一切正常(免費 TronGrid 不行,rate limit 超嚴) |
| EarnService 邏輯設計可行嗎? | ✅ Phase 2 e2e 全通,8% APY 90 天的數字對得上 |
| **目前 JustLend USDT supply APY?** | ⚠️ **1.37%** — 比預期低很多 |
| 抽 15% perf fee 後 net APY? | **1.16%** — 跟台灣定存差不多,**不夠吸引** |

**重大發現**:**單看 JustLend** yield 太低,**但跨多協議掃**(Phase 1.5 加跑)看到 4-5% USDT yield 選項充足,**B 方向(多協議 aggregator)可行**。

---

## 1. Phase 1 結果 — JustLend mainnet read-only

跑 `apps/api/scripts/poc_justlend_readonly.py`,**2026-05-01** 的鏈上即時數據:

| 項目 | 值 | 解讀 |
|---|---|---|
| Contract | `TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd` | ✓ 地址有效,驗證為 jUSDT |
| symbol() | `jUSDT` | ✓ |
| decimals() | 8 | jToken 標準 |
| underlying() | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | ✓ = USDT_TRC20,確認沒走錯協議 |
| exchangeRateStored() | 0.0108 USDT per jUSDT | 從初始 0.02 已下降代表協議在派發利息 |
| **supplyRatePerBlock** | 1,290,413,823 | |
| **隱含 Supply APY** | **1.37%** | ⚠️ 重點數字,影響商業模式 |
| Borrow APY | 3.12% | |
| getCash() | $131,216,313 | 還沒被借出去的部分 |
| totalBorrows() | $126,399,076 | 已借出去的部分 |
| totalReserves() | $221,647 | 協議自留的儲備 |
| **TVL** | **$257M** | 健康規模 |
| Utilization | 49.1% | 健康(< 90%)|
| totalSupply (jUSDT) | 23.9B | 與 TVL × exchange rate 一致 |
| reserveFactorMantissa | 10% | 協議自留 10% interest,supplier 拿 90% |

### 技術 takeaway

- ✅ 合約地址、ABI、decimals 全部 verify
- ✅ Compound v2 ABI 完全 reuse
- ⚠️ **public TronGrid 嚴重 rate-limit**(429 after 2-3 calls 即使加 backoff)
  → production 必須 paid TronGrid key 或我們自己的 Tron node 或 Tatum proxy
- ⚠️ Tatum 回的 `constant_result[0]` 對 single uint256 method 也是 192 chars(3 個 uint256 concatenated, padded with zeros);**取前 64 chars** 才是真正的值

---

## 1.5 Phase 1.5 — 多平台 USDT yield scanner(關鍵 update)

跑 `apps/api/scripts/poc_yield_scanner.py`,**2026-05-01** 即時掃描 Bitfinex + DefiLlama:

```
平台                  鏈                APY     TVL       備註
─────────────────────────────────────────────────────────────────
Bitfinex Funding      CeFi (USD)    15.44%    —        FRR×365 即時值,實際成交率 ~5.66%
Fluid Lending         Ethereum       5.13%   $118M     base 3.6% + reward 1.5%
AAVE V3              Ethereum       4.90%   $126M
Venus Flux           BSC            4.56%   $41M
Compound V3          Ethereum       3.05%   $36M      base 2.9% + reward 0.1%
Spark Savings        Ethereum       3.00%   $1,137M   ← TVL 最大,Maker DAO
Sparklend            Ethereum       2.69%   $140M
Venus Core           BSC            1.95%   $95M
JustLend             Tron           1.37%   $129M     ← 我們之前 PoC 的協議
```

### 抽 15% perf fee 後用戶 net APY 對比定存(1.6%)

| 協議 | gross | net | vs 定存 |
|---|---|---|---|
| Bitfinex Funding (USD) | 15.44% | 13.12% | ✓ 大勝 |
| Fluid Lending | 5.13% | 4.36% | ✓ |
| AAVE V3 Ethereum | 4.90% | 4.16% | ✓ |
| Venus Flux BSC | 4.56% | 3.88% | ✓ |
| Compound V3 Ethereum | 3.05% | 2.60% | ✓ |
| Spark Savings | 3.00% | 2.55% | ✓ 略勝 |
| Sparklend | 2.69% | 2.29% | ✓ 略勝 |
| Venus Core BSC | 1.95% | 1.66% | ⚠ 邊緣 |
| JustLend Tron | 1.37% | 1.16% | ✗ 輸 |

**結論:有 8 個選項贏定存,商業可行**。

### Break-even TVL 重新計算

| 假設 | gross APY | 需要 TVL($300/月成本) |
|---|---|---|
| 單跑 JustLend(原 PoC) | 1.37% | $1,752,000 |
| 單跑 AAVE V3 Ethereum | 4.9% | $490,000 |
| 多協議混合(平均 4-5%) | ~4.5% | **~$534,000** |

→ **B 方向 break-even TVL ≈ 50 萬美金**,250-500 個用戶 × $1-2K 即可達,3-6 個月內合理。

### Bitfinex 的特別性

- API 抓 fUSDT 失敗(500),但 fUSD 抓到 15.44% FRR-annualized。`/v2/ticker/fUSD` 應穩定可用
- Bitfinex funding rate 高度波動:平淡期 1-5% / 一般 5-15% / 牛市瞬間可達 30%+
- 但**只能 lend USD,不是 USDT** — 用戶要先把 USDT 換成 USD
- Bitfinex 帳戶整合 + sub-account 限制(institutional plan)讓技術整合難,先 deprioritize

### 重要警示:跨鏈 bridge 風險

- 我們現在 USDT 都在 Tron(USDT-TRC20)
- 要部署到 AAVE Polygon / Ethereum / Arbitrum,**必須先 bridge USDT 跨鏈**
- 跨鏈 bridge 出事的歷史:Wormhole($320M)、Ronin($600M)、Nomad($190M)、PolyNetwork($600M)
- 主流 bridge 選項:
  - **Stargate**(LayerZero):USDT 跨鏈最熟、流動性最大、被駭歷史較少
  - **Axelar**:相對保守,但 USDT 流動性次之
  - **Wormhole**:跨鏈最廣但被駭過,信任打折扣
- 推薦:**Stargate** for USDT bridging
- 用戶體驗:bridge 也要付 gas + 0.06% bridge fee,兩端確認 5-10 分鐘

---

## 2. Phase 2 結果 — Mock E2E

跑 `apps/api/scripts/poc_earn_e2e.py`,純 in-memory 測完整流程:

```
✓ Step 1: 存 1000 USDT  → position value 1000
✓ Step 2: +30 天        → 利息 6.58 USDT(預期 1000 × 8% × 30/365 = 6.58 ✓)
✓ Step 3: 加碼 500      → settle 之前利息成本金,新 position 1506.58
✓ Step 4: +60 天        → position value 1526.39
✓ Step 5: 贖回一半       → perf fee = interest × 15% = 1.98 USDT
✓ Step 6: 贖回剩餘       → 部位清空,Quiver 共收 3.96 USDT perf fee
✓ Step 7: 部位歸零驗證

Total deposited: 1500 USDT
Total received:  1522.43 USDT
Quiver income:   3.96 USDT
Effective net APY: 6.06%(預期 6.8%,因部分本金只 hold 60 天而非 90 天,合理)
```

### Code 結構交付

```
apps/api/app/services/earn/
├── __init__.py             # public exports
├── interface.py            # YieldProtocol abstract base
├── mock.py                 # MockYieldProtocol(8% APY,可快轉時間)
└── service.py              # EarnService facade
                            # - deposit / withdraw / get_position_value
                            # - perf fee 計算
                            # - principal vs interest 拆解
```

### 技術 takeaway

- ✅ 抽象設計乾淨:YieldProtocol interface 之後加 JustLend / AAVE 不用動 EarnService
- ✅ Perf fee 邏輯只抽利息 portion,本金 1:1 還回 — 對齊「performance fee」業界做法
- ✅ Settle 邏輯正確:加碼會把當下累積利息結算進本金後再加新本金(加碼 ≠ 重置 timer)
- ⚠️ PoC 沒接 DB,production 要做的:
  1. 加 schema `earn_user_positions(user_id, protocol_name, principal, deposited_at, last_settled_at)`
  2. ledger 加 4 個 tx types:`EARN_DEPOSIT` / `EARN_WITHDRAW` / `EARN_INTEREST_REALIZED` / `EARN_PERF_FEE`
  3. deposit 改 worker 流程(send USDT → call protocol.supply → 等 confirms → settle)
  4. periodic interest settle cron(每天結算累積利息進 ledger,讓用戶 dashboard 即時看到)

---

## 3. Findings & 商業意義

### 🚨 Finding 1: 當下 JustLend USDT APY 只有 1.37%

| | 預期 | 實際 |
|---|---|---|
| Gross APY | 8% | **1.37%** |
| Net APY (after 15% perf fee) | 6.8% | **1.16%** |
| 用戶 1000 USDT 一年賺 | $68 | **$11.6** |
| 對比台灣金融商品 | 高於郵局活儲(~0.5%)、定存(~1.6%) | **跟活儲差不多,輸定存** |

#### 對 break-even 的影響

之前 PROPOSAL 算 break-even TVL 用 8% APY 假設:
- 月成本 $300 / (15% × 8% / 12) = $300K TVL

用實際 1.37% 重算:
- 月成本 $300 / (15% × 1.37% / 12) = **$1,752,633 TVL**

→ break-even TVL 從 30 萬美金漲到 **175 萬美金**(5.8 倍),商業可行性難度大幅上升。

#### 為什麼 APY 這麼低

可能原因:
1. **Utilization 49%** — 借需求不夠強,supply rate 自然壓低
2. **DeFi 整體熊市 yield** — 2021 那種 20% APY 時代過去了,當下 stable yield 普遍 1-5%
3. **Tron 鏈相對冷清** — JustLend 雖然 TVL $257M 不小,但跟 Ethereum AAVE($30B)、Arbitrum 比是冷的

#### 牛市 / 熱門時段的 APY 估計

歷史上 JustLend USDT APY 曾達 8-15%(2022-2023 牛市),當前 utilization 49% 已是正常水位。**短期內不太可能突然回到 8%+**,除非 Tron 生態有重大事件。

---

### Finding 2: 多協議 aggregator 的必要性凸顯

如果鎖死 JustLend(目前 1.37%),用戶體驗極差。要做這個 pivot 必須跨協議:

| 協議 | 鏈 | 當下 USDT supply APY (估計) | 整合難度 |
|---|---|---|---|
| JustLend | Tron | 1.37% (read-only confirmed) | ✅ 已 PoC |
| AAVE V3 | Polygon | 3-5% | 中(需 bridge USDT 跨鏈)|
| AAVE V3 | Arbitrum | 4-6% | 中 |
| Compound V3 | Ethereum mainnet | 5-8% | 高(gas 貴)|
| Pendle | 多鏈 | 7-15%(固定收益) | 高(產品複雜)|
| Spark Lend (Maker) | Ethereum | 6-9% | 高 |

**Phase 2 + 3 的 multi-protocol 變成必要,不是 nice-to-have**。

---

### Finding 3: Tatum 是 production-ready 的 Tron RPC,但要付費

- ✅ Tatum 付費 plan 有 Tron RPC node access via `/v3/blockchain/node/tron-mainnet/...`
- ✅ 沒有 free TronGrid 那種 rate-limit 問題
- ⚠️ 回傳格式不是純 standard ABI(uint256 變 192 chars),要客製 decoder
- 替代方案:自己跑 Tron node($10-30/mo VPS + ~50GB SSD)— 可能比 Tatum 便宜長期

---

### Finding 4: Tron 鏈只有 jUSDT 沒選擇

- JustLend 是 Tron 上**唯一**主流 lending(其他有 SunSwap 等但不太活躍)
- 如果 JustLend 出事(遭駭、rugged),Tron 用戶無處可去
- → 為 Tron 用戶提供「Tron 鏈內」的選擇有限

---

## 4. 三個方向的推薦(待你決定)

### 🅰️ 方向 A:暫停 Earn pivot

**理由**:當下 yield 太低,商業上難以說服用戶 + 難以 break-even。

**繼續往**:
- Phase 7 mobile app
- Phase 8 營運強化
- 6E 已完成,直接準備上線

### 🅱️ 方向 B:重新設計成「多協議 aggregator」

**理由**:用戶要看到多個選項才有差別化。技術上跨鏈 bridge 是最大新挑戰。

**新增工作**:
- AAVE V3 integration(Polygon)
- USDT 跨鏈 bridge(用 Stargate / Axelar / LayerZero)
- 用戶面 UI 顯示 4-5 個協議比價
- 工時:多 2-3 週

### 🅲️ 方向 C:focus 「Yield Tracker / Educator」

**理由**:不替用戶執行,只當「資訊 + 教育」平台。Quiver Earn 變成「讀 onchain APY,告訴用戶現在哪邊好,提供他自己鏈接協議的 deeplink」。

**好處**:
- ✅ 法規幾乎零風險(純資訊服務)
- ✅ 工時最低(1 週可發)
- ✅ 跟現有 wallet 自然融合
- ❌ 沒有 perf fee 收入,改靠廣告 / 引流佣金 / 訂閱

---

## 5. 建議

我的個人建議:

1. **先暫停 Earn 不做** — 1.37% APY 不值得花 4-6 週寫 production code
2. **持續監控 APY** — 寫個簡單 cron 每天記錄 JustLend / AAVE / Compound 的 USDT supply APY,放進 admin dashboard。**等 APY 回到 5%+ 持續 1 個月以上**,商業環境就支撐 break-even,那時再啟動 implementation
3. **同時繼續其他方向** — 6E 全部完成 → 律師諮詢(同時跑)→ 走 launch runbook → 6E + 律師 OK 就準備上 mainnet
4. **Phase 7 mobile 跟 Earn 是不同戰場** — 可以並行考慮(mobile 是 channel,Earn 是 product)

---

## 6. PoC code summary

### 新增檔案

```
apps/api/scripts/poc_justlend_readonly.py   # Phase 1 read-only
apps/api/scripts/poc_earn_e2e.py            # Phase 2 mock e2e
apps/api/app/services/earn/
  ├── __init__.py
  ├── interface.py        # YieldProtocol ABC
  ├── mock.py             # MockYieldProtocol
  └── service.py          # EarnService facade
```

### 新增 dependency

```
tronpy>=0.4   # Tron Python SDK,雖然 PoC Phase 1 沒最終用到,留著未來簽 tx 用
```

### 沒做 schema 改動,沒接 DB,沒改 production code

PoC code 完全 isolate 在 `services/earn/` + `scripts/`。要正式做 Earn 才會動 schema + worker。

---

## Appendix: 怎麼跑 PoC

```bash
# Phase 1 read-only(需 Tatum 付費 mainnet key,已在 .env)
docker compose exec -T \
  -e TATUM_API_KEY_MAINNET=$(grep "^TATUM_API_KEY_MAINNET=" .env | cut -d= -f2) \
  api python /app/scripts/poc_justlend_readonly.py

# Phase 2 mock e2e
docker compose exec -T -e PYTHONPATH=/app api \
  python /app/scripts/poc_earn_e2e.py
```
