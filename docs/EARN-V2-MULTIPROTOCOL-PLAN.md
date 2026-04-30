# Quiver Earn V2 — Multi-Protocol Aggregator Plan

> **Status**: Plan locked, PoC Phase 3 pending
> **Decision date**: 2026-05-01
> **Supersedes**: 部分 `QUIVER-EARN-PROPOSAL.md` 的單協議假設

---

## TL;DR

Quiver Earn 從「JustLend USDT 單協議」改為「**多協議 EVM yield aggregator + auto-rebalance**」:

- **協議**: AAVE V3、Fluid Lending、Spark Savings、Morpho Blue(全部 EVM)
- **鏈**: Ethereum mainnet + Polygon(主)/ Arbitrum(備)
- **跨鏈**: Quiver 雙邊(Tron + EVM)持有 float,內部 rebalance,**用戶不直接碰 bridge**
- **策略**: Yearn 模式 auto-rebalance,系統每天掃 APY,自動把資金搬到當下最高協議
- **時間**: V1 預估 8-10 週(含 bridge + auto-rebalance 完整版)
- **法律**: 從「工具」升級到「主動管理」,需要先請律師才能上線

---

## 鎖定的 4 個關鍵決策

| # | 決策 | 結論 | 衍生影響 |
|---|---|---|---|
| 1 | V1 支援哪些協議 | AAVE V3 / Fluid / Spark / Morpho Blue | 全 EVM,沒 Tron 原生協議 |
| 2 | 跨鏈策略 | 走正式 bridge(C 方案) | **但 Stargate 不支援 Tron**,需改用 Allbridge/Symbiosis,且改為 platform-managed float 模型 |
| 3 | Rebalance 模式 | Auto-rebalance(Yearn 模式) | 法律風險升級,需律師白皮書;系統複雜度 +30% |
| 4 | V1 範圍 | 完整版 | 預估 8-10 週 |

---

## 架構總覽

```
┌──────────────────────────────────────────────────────────────────┐
│                          User Side                                │
│  USDT-TRC20 (用戶在 Tron,因為 KYC + onboarding 已建構在 Tron)        │
│  ↓ deposit                                                        │
│  Tron HOT wallet (Quiver 持有,所有用戶共用)                          │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       │  (內部記帳:user_balance += amount)
                       │
┌──────────────────────▼───────────────────────────────────────────┐
│                    Quiver Internal Ledger                         │
│  - users[].virtual_position: Decimal                              │
│  - users[].active_strategy: "aave_polygon" / "fluid_eth" / etc.   │
│  - protocol_states[]: 即時 supply rate / TVL / utilization        │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       │  (Quiver 用「自己的 EVM float」進場)
                       │
┌──────────────────────▼───────────────────────────────────────────┐
│                    Quiver EVM Float Pool                          │
│  - 多鏈持有 USDT-ERC20(Polygon / Ethereum / Arbitrum)              │
│  - 部署到當前最佳 strategy                                          │
│  - 利息回流時 mint 給 ledger 上的 virtual position                    │
└──────────────────────┬───────────────────────────────────────────┘
                       │
       ┌───────────────┼────────────────┬──────────────┐
       ▼               ▼                ▼              ▼
   AAVE V3         Fluid           Spark         Morpho Blue
   (Polygon)     (Ethereum)     (Ethereum)      (Ethereum)
```

**核心 insight**:
- 用戶的 USDT 永遠在 **Tron**(KYC、提領流程都建構在 Tron 上,不動)
- Quiver 在 EVM 上維護自己的 USDT float,**用 platform 自己的錢**部署到 protocol
- 用戶利息來自:Quiver 的 EVM float 賺到的利息 ÷ 用戶虛擬餘額占比
- Quiver 透過 **bridge 自家 float**(admin 手動觸發,每週 ~1 次)平衡 Tron/EVM 兩邊水位
- 用戶**永遠不直接碰 bridge**,bridge 是 platform 後勤

> ⚠️ **注意**:這個模型把 Quiver 變成「資金混合池營運者」,法律定性接近「集合投資管理」(類似基金)。律師要先確認台灣 § 16(投信投顧法)、§ 22-2(銀行法)、§ 29(集合資金管理)的紅線。

---

## 1. 協議整合矩陣

| 協議 | 鏈 | 當前 APY | TVL | 整合難度 | SDK | 安全 |
|---|---|---|---|---|---|---|
| **AAVE V3** | Polygon | ~4.9% | $1.2B (Polygon pool) | 低 | aave-v3-py / web3.py + ABI | 9/10 龍頭 |
| **Fluid Lending** | Ethereum | ~5.1% | $2.1B | 中 | 無官方 SDK,直接 ABI | 7/10 新但成長快 |
| **Spark Savings** | Ethereum | ~4.5% | $3.8B | 低 | sDAI/sUSDS pattern | 9/10 MakerDAO 系 |
| **Morpho Blue** | Ethereum | 3-7% (vault 不同) | $4B+ | **高** | morpho-blue-sdk-py(curated vaults 才安全) | 7/10 設計新穎 |

### 1.1 AAVE V3 Polygon

**為什麼擺第一**:文檔最完整、bug 史最少、Polygon gas 便宜(~$0.02 / tx),適合 V1 主力。

**Adapter 介面**:
```python
class AaveV3Adapter(YieldProtocol):
    chain: str = "polygon"
    asset: str = "USDT"
    pool_address: str = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"  # AAVE V3 Polygon Pool
    aToken_address: str = "0x6ab707Aca953eDAeFBc4fD23bA73294241490620"  # aPolUSDT

    async def supply(self, amount: Decimal) -> str  # tx hash
    async def withdraw(self, amount: Decimal) -> str
    async def get_supply_rate(self) -> Decimal  # APY
    async def get_position(self, owner: str) -> Decimal  # aToken balance
```

**Read-only PoC**(下一步):用 `web3.py + Infura` 讀 `Pool.getReserveData("USDT")`,拿出 `liquidityRate` 換算 APY,跟 DefiLlama 對齊驗證準確性。

### 1.2 Fluid Lending

**特色**:Instadapp 出的新 lending,APY 通常比 AAVE 高 0.2-0.5%,因為 utilization 普遍高。

**注意**:
- Fluid 的 fToken 模型跟 Compound 類似(jToken-like)
- 沒有 Python SDK,要自己 wrap ABI
- 已被多家審計(Spearbit + Code4rena)

### 1.3 Spark Savings (sUSDS)

**特色**:MakerDAO 衍生,APY 由 DSR 直接決定,**APY 最穩**(年波動 < 1%)。

**整合超簡單**:就是 ERC4626 vault,呼叫 `deposit(assets, receiver)` / `redeem(shares, receiver, owner)` 就好。

**catch**:Spark 給的是 **USDS**(MakerDAO 新穩定幣),不是 USDT。
- 需要再 swap USDT→USDS(可走 PSM,1:1 沒滑點)
- 提領時反向 USDS→USDT
- 多一層 swap 風險,但 PSM 是官方的、無滑點、無腦

### 1.4 Morpho Blue

**特色**:isolated lending market,APY 最高(熱門 vault 6-7%)但複雜度也最高。

**重要**:**只用 Morpho 自己 curated 的 USDT vaults**,不要碰 user-created vaults(那是 wild west)。

具體:
- `Steakhouse USDT` vault: ~4.5%, $200M TVL, 由 Steakhouse Financial 管(專業 risk manager)
- `Gauntlet USDT` vault: ~5.2%, $150M TVL, 由 Gauntlet 管
- **避免** isolated markets 帶 LRT / 高 risk collateral 的(APY 7%+ 但 underlying 是新資產)

---

## 2. Bridge 策略(重新設計)

### 2.1 為什麼不能照原計畫(per-user bridge)

我之前提的「用戶存入時自動 bridge」有兩個問題:
1. **Stargate / LayerZero OFT 不直接支援 Tron**(LayerZero 雖然有 Tron 端點,但 USDT OFT 沒有部署過去)
2. 假設能 bridge,**每個用戶 deposit / withdraw 都要走一次 bridge**,gas + bridge fee 對小額用戶很傷($1 deposit + $2 bridge fee = -200% 本金)

### 2.2 改為 Platform-Managed Float 模型

**新流程**:

**用戶 deposit**:
1. 用戶送 USDT-TRC20 到 Tron HOT
2. Quiver 偵測到入金,**內部記帳** `user.virtual_position += amount`
3. **不立刻**部署到任何協議。等 Quiver 的 EVM float 已預先部署。
4. 用戶看到的「我在 AAVE V3 Polygon 賺 4.9%」是個會計分配,不是實際 onchain position。

**用戶 withdraw**:
1. 用戶按提領,Quiver 從 Tron HOT 直接出 USDT-TRC20 給用戶(原本就有的 Phase 6E withdrawal pipeline)
2. 內部記帳 `user.virtual_position -= amount`
3. 利息 portion 扣 15% perf fee
4. **如果 Tron HOT 不夠**(用戶提領超過 hot_max):
   - 觸發運營者警報
   - 從 EVM 反向 bridge(走 Allbridge USDT-Polygon → USDT-TRC20,~30 分)
   - 或從 COLD 撥回 Tron HOT(現有機制)

**Quiver 後勤**:
- 系統監控 Tron HOT 水位 + EVM strategy 部位
- 每 24h 跑 reconciliation:`sum(user_virtual_positions) == Tron_HOT + EVM_strategy_value - in_flight`
- 每週運營者人工跑 1 次 bridge 重平衡(目標:Tron HOT 持有 ~30% 部位作流動性,EVM 部署 ~70%)

### 2.3 跨鏈 bridge 選擇(運營端,不是用戶)

只有運營者(admin)會操作 bridge,且每週才 1 次,可以:
- 選最安全的(不選最便宜)
- 拆分大額(避免單筆超過 bridge TVL 的 5%)

**候選**(2026 Q2 現況):

| Bridge | Tron 支援 | 安全紀錄 | Fee | 推薦度 |
|---|---|---|---|---|
| Allbridge Core | ✅ Tron↔Polygon/ETH/BSC USDT | 2022 起無重大 hack | 0.3% + gas | ⭐⭐⭐⭐ |
| Symbiosis | ✅ Tron↔EVM USDT | 一次小型 incident,已修復 | 0.1% + slippage | ⭐⭐⭐ |
| cBridge (Celer) | ✅ Tron 支援 | Multichain 後變保守了 | 0.04% + gas | ⭐⭐⭐ |
| **Binance/OKX 代墊** | ✅ 100% 可靠 | CEX 風險(自己跑路) | 0 fee + 提領手續費 | ⭐⭐⭐⭐⭐(實務最常用) |

**建議**:
- **首選 Binance withdraw**:深存 Tron USDT 到 Binance (無 fee) → 從 Binance withdraw USDT-Polygon (~$1 fee)
- **備選 Allbridge**:當不想動用 CEX(週末、夜間、CEX 維護)時用
- **絕對不要 Multichain / Wormhole(USDT)**:都有過 hack 史

### 2.4 Bridge 失敗處理

關鍵 invariant:**用戶的虛擬餘額永遠優先於 Quiver 的 EVM 部位**。

如果 bridge 卡了 / 失敗:
- 用戶提領照常運作(Tron HOT 是流動性兜底)
- Quiver 自己吃下 bridge 損失(從 platform_profit 扣)
- 嚴重時凍結 admin rebalance 功能,等 incident response

---

## 3. Auto-Rebalance 演算法

### 3.1 什麼時候 rebalance?

**入金 / 出金時觸發 lazy rebalance**:
- 不是真的搬資金,而是**新進的 float 部署到當前最佳協議**
- 出金時優先從利率最低的協議撤回(maximize 留下的部分繼續高 APY 賺)

**每日 cron rebalance**(00:00 UTC):
1. 掃 4 個協議的當前 APY
2. 算「搬遷淨收益」:
   ```
   delta_APY = (best_APY - current_APY)
   annualized_gain = position * delta_APY
   gas_cost = withdraw_gas + bridge_gas + supply_gas
   payback_days = gas_cost / (annualized_gain / 365)
   ```
3. **只在 payback < 14 天時搬**(避免抓 noise)
4. 每次 rebalance 上限 30% 部位(避免雞蛋全在新籃子裡 black-swan)

### 3.2 Rebalance 護欄

**硬規則**(寫在 contract / service):
- 單次最多搬 30% 總部位
- 24h 內 rebalance 次數上限 1 次
- TVL < $50M 的協議自動移出候選池(不夠安全)
- 任何協議 utilization > 95% 自動移出(撤回會卡)
- APY 突然 +500% (vs 7-day MA) 自動移出(可能是攻擊 / oracle bug)

**軟規則**(可調整):
- 偏好 Polygon over Ethereum(gas 便宜 100 倍)
- AAVE / Spark 在 APY 接近時優先(安全係數)

### 3.3 失敗 / 部分成功處理

例如 withdraw AAVE 成功 but bridge 失敗 → 資金卡在 Polygon HOT:
- 標記 `rebalance_status = "STUCK"`,觸發 admin 警報
- 不影響用戶虛擬餘額(會計層獨立)
- admin 手動處理(換 bridge / 等修復)

---

## 4. Database Schema 變更

### 4.1 新表

```sql
-- Quiver 在每個協議的當前部位
CREATE TABLE protocol_positions (
    id SERIAL PRIMARY KEY,
    protocol VARCHAR(32) NOT NULL,        -- "aave_v3_polygon"
    chain VARCHAR(16) NOT NULL,           -- "polygon"
    underlying_address VARCHAR(64) NOT NULL,  -- USDT contract on chain
    receipt_token_address VARCHAR(64),    -- aToken / fToken / sUSDS
    underlying_balance NUMERIC(38, 18),   -- 等值 USDT
    receipt_balance NUMERIC(38, 18),      -- aToken 餘額
    last_apy NUMERIC(6, 4),               -- 0.0490 = 4.90%
    last_updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (protocol, chain)
);

-- Auto-rebalance 紀錄(audit)
CREATE TABLE rebalance_logs (
    id SERIAL PRIMARY KEY,
    triggered_by VARCHAR(16) NOT NULL,    -- "cron" / "deposit" / "admin"
    from_protocol VARCHAR(32),
    to_protocol VARCHAR(32),
    amount NUMERIC(38, 18),
    expected_delta_apy NUMERIC(6, 4),
    gas_cost_usd NUMERIC(10, 2),
    payback_days INTEGER,
    status VARCHAR(16),                   -- "PENDING" / "SUCCESS" / "STUCK" / "FAILED"
    tx_hashes JSONB,                       -- {"withdraw": "0x...", "bridge": "0x...", "supply": "0x..."}
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bridge 紀錄
CREATE TABLE bridge_logs (
    id SERIAL PRIMARY KEY,
    direction VARCHAR(16) NOT NULL,        -- "tron_to_evm" / "evm_to_tron"
    bridge_provider VARCHAR(32) NOT NULL,  -- "allbridge" / "binance" / "symbiosis"
    amount NUMERIC(38, 18) NOT NULL,
    fee NUMERIC(38, 18),
    src_tx_hash VARCHAR(128),
    dst_tx_hash VARCHAR(128),
    status VARCHAR(16) NOT NULL,           -- "INITIATED" / "CONFIRMED" / "STUCK"
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);
```

### 4.2 既有表延伸

```sql
-- earn_positions 加 strategy 欄位
ALTER TABLE earn_positions ADD COLUMN strategy VARCHAR(32) DEFAULT 'auto';
-- "auto" 表示跟著 auto-rebalance,V2 可以開放 "aave_only" 等 manual override

-- earn_positions 加 last_apy_snapshot
ALTER TABLE earn_positions ADD COLUMN last_apy_snapshot NUMERIC(6, 4);
-- 顯示給用戶看「你過去 30 天平均 APY」
```

---

## 5. 後端服務分層

```
EarnService                  ← 對前端 API
  └─ StrategyManager         ← 決定當下要用哪個 protocol
       ├─ AaveV3Adapter      ← 跟 protocol 講話
       ├─ FluidAdapter
       ├─ SparkAdapter
       └─ MorphoAdapter
  └─ BridgeManager           ← 跨鏈
       ├─ AllbridgeAdapter
       ├─ BinanceAdapter (admin only)
       └─ SymbiosisAdapter
  └─ ReconciliationService   ← 每日對帳
  └─ RebalanceService        ← cron + on-deposit/withdraw
```

每個 adapter 都實作 `YieldProtocol` ABC(我們 PoC Phase 2 已經寫好)。

---

## 6. UX(用戶看到什麼)

V1 給用戶看的不是「我選哪個協議」,而是 **statement-style** 顯示:

```
┌──────────────────────────────────────────┐
│  💰 你的存款                                │
│  $1,234.56 USDT                          │
│                                          │
│  📈 30 天淨 APY: 4.12%                    │
│  📊 累計利息: $42.10 USDT (扣 15% 手續費後)  │
│                                          │
│  目前資金分布(Quiver auto-managed):      │
│  ┌────────────────────────────────┐    │
│  │ AAVE V3 Polygon         62%    │    │
│  │ Fluid Lending Eth       28%    │    │
│  │ Spark Savings           10%    │    │
│  └────────────────────────────────┘    │
│  上次 rebalance: 8 小時前                 │
│                                          │
│  [存入 USDT]  [提領]                      │
└──────────────────────────────────────────┘
```

**重要**:
- 不顯示「即時 APY」(誤導,當下高不代表未來高)
- 顯示「30 天平均 net APY」(有歷史追溯)
- 風險揭露 banner:**「DeFi 協議有 smart contract 風險,過往報酬不代表未來」**(常駐,不是只有 onboarding)

---

## 7. V1 時間估算(週對應任務)

> 工作日為主,假設 1 個 dev,平均一週 30 hr 投入。

| Week | 任務 | 完成標準 |
|---|---|---|
| **W1** | Phase 3 PoC: AAVE V3 Polygon read-only | 從 mainnet 抓出 USDT supply rate, 與 DefiLlama 一致 |
| **W2** | AAVE V3 adapter (write path 在 testnet) | Polygon Mumbai testnet deposit / withdraw 跑通 |
| **W3** | Fluid + Spark adapters (testnet) | ERC4626 通用化、Spark USDS swap 整合 |
| **W4** | Morpho Blue adapter + 4 個 adapter 整合測試 | strategy_manager 可挑選最佳 protocol |
| **W5** | Bridge: Allbridge Tron↔Polygon 整合 | testnet 跑通 USDT bridge,失敗 retry 流程 |
| **W6** | Bridge: Binance 整合(API)+ Tron HOT 水位監控 | admin dashboard 顯示 4 鏈水位 + 可一鍵 rebalance |
| **W7** | Auto-rebalance 演算法 + cron + protective rules | 每日自動 rebalance、payback 護欄 |
| **W8** | UX: dashboard、用戶 statement、風險揭露 onboarding | 用戶端 deposit/withdraw 完整體驗 |
| **W9** | E2E mainnet smoke + 監控 / alerting | 真錢小額(< $100)跑通整路 |
| **W10** | Beta 30 用戶 + bug fix + 文件 | 上線(beta)|

**buffer**:預留 2 週給「發現 protocol 新版/協議變動 / bridge 中斷」。

> ⚠️ **legal gate**:W7 開始前必須完成律師意見書;W10 上線前要有用戶協議重寫 + 風險揭露法律審。

---

## 8. 法律風險(B 方向更新)

跟單協議 (C 方向) 比,**auto-rebalance + 多協議 = 風險升級兩級**:

### 8.1 質變的部分

| 項目 | C 方向(只給工具) | B 方向(代管 auto-rebalance) |
|---|---|---|
| 法律定性 | 工具 / 教學服務 | **集合資金管理**(類比基金) |
| 銀行法 § 29 | 邊緣安全 | **高風險**(收受不特定人款項) |
| 投信投顧法 § 16 | 不適用 | **可能適用**(管理他人資產) |
| 信託業法 | 不適用 | **可能適用**(代管財產) |
| 揭露要求 | 風險告知 | **完整公開說明書**等級 |

### 8.2 律師必問項目(更新版)

新增以下問題(原 PROPOSAL 12 個類別之外):

13. **資金混合池**:Quiver 把所有用戶的 USDT 放在同一個 EVM strategy 裡,法律定性是?
14. **內部記帳**:用戶的虛擬餘額 vs 實際 onchain 部位不對應,是否有「未完全擔保」風險?
15. **auto-rebalance 是否觸發投顧執照**:每天系統自動換協議,算不算「替客戶做投資決策」?
16. **多鏈 invariants**:Tron + 4 鏈 EVM 的 7×24 監控義務,出事誰負責?
17. **bridge hack 賠付責任**:如果 Allbridge 被駭、Quiver 的 EVM float 損失,要從 platform_profit 賠用戶嗎?賠不夠怎麼辦?
18. **stable coin 風險揭露**:USDT 脫鉤、USDS depeg 的揭露程度?
19. **SaaS vs 投資工具**:Quiver 收 15% perf fee,法律上是「成功報酬」還是「服務費」?
20. **海外協議的稅務**:DeFi 利息在海外 protocol 賺到,但用戶在台灣,扣繳義務在誰?

### 8.3 V0 vs V1 的策略

如果律師回答完 1-20 後判斷風險過高,**V0 退路**:
- 砍掉 auto-rebalance(改決策3 → B 手動選)
- 砍掉多協議(只留 AAVE V3 一個)
- 退回到「工具」定位,讓用戶自己選

→ **建議**: 跟律師談時要備兩套方案,聊完律師再決定 V1 範圍。

---

## 9. Phase 3 PoC 計畫(下一步)

### 9.1 任務排序

| # | 任務 | 工時 | 阻塞性 |
|---|---|---|---|
| 1 | AAVE V3 Polygon read-only(web3.py + Infura free) | 半天 | 必做 |
| 2 | Fluid + Spark + Morpho read-only | 1 天 | 必做(驗證 4 個都能讀) |
| 3 | Allbridge Tron→Polygon testnet 模擬 | 1 天 | 必做(驗證跨鏈技術可行) |
| 4 | mainnet 小額煙霧測試:1 USDT 走全程 | 半天 + ~$10 | 強建議 |
| 5 | StrategyManager + ReconciliationService 雛形 | 2 天 | 可延 V1 W4 做 |

### 9.2 阻塞項目

PoC 不能繼續往下做的條件:
- AAVE V3 supply rate 讀取結果跟 DefiLlama 不一致 → 我們的 ABI / decode 有 bug,要除錯
- Fluid / Morpho 的 Python 讀取超複雜 → 評估換 TypeScript / 引入 Node service
- Allbridge testnet 跑不通 → 評估改用 Symbiosis / 或先做 EVM-only(只支援 EVM 用戶,Tron 用戶要自己 bridge)

### 9.3 PoC 完成後產出

1. `poc_aave_polygon.py` — read AAVE supply rate
2. `poc_multi_protocol_scan.py` — 同時讀 4 個協議 APY 對齊 DefiLlama
3. `poc_allbridge_testnet.py` — testnet bridge 跑通,輸出 tx hash + 確認 funds 到帳
4. `poc_smoke_mainnet.md` — 1 USDT 全程試跑紀錄(從我自己錢包出發)
5. `EARN-POC-REPORT.md` 更新 Phase 3 章節

---

## 10. 風險登記簿

| 風險 | 機率 | 衝擊 | 緩解 |
|---|---|---|---|
| AAVE / Spark protocol bug 被 exploit | 低 | 致命 | 分散在 4 個協議、單協議上限 50%、買 Nexus Mutual cover |
| Bridge hack(Allbridge) | 中 | 高 | Bridge fee 預算列「風險準備金」、限額單次 ≤ $50K |
| USDT 脫鉤 | 低 | 致命 | 強制風險揭露、不承諾保本、保留 admin pause |
| auto-rebalance 演算法 bug | 中 | 高 | 模擬資料 backtest 30 天才上線、harderror 護欄 |
| 律師判定為違法 | 中 | 致命 | **W7 前必須有律師意見書**,否則退 V0 方案 |
| 用戶提領 surge,Tron HOT 不夠 | 中 | 中 | bridge 反向 + COLD 撥回 + 提領金額閾值警報 |
| Quiver 的 EVM float 不足以給用戶利息 | 低 | 致命 | reconciliation 每日對帳、float 缺口立即警報 |
| 多協議 APY 同步崩(整個 DeFi 衰退) | 中 | 中 | 早期不靠這賺錢、純 perf fee 不會虧、可暫停接 deposit |

---

## 11. 商業數字重估

### 11.1 break-even TVL(更新)

假設 V1 平均 net APY 4.5% (= gross 5.3% × 0.85):

- 每 $100K TVL 一年產生:$100K × 5.3% × 15% = **$795 perf fee**
- 假設 Quiver 月運營成本(infra + dev partial):$5,000 / month = $60K / year
- break-even TVL = $60K / 0.795% = **~$7.5M**

> 比 JustLend 單協議的 $1.75M 高,因為多協議 dev / 監控成本更高。

### 11.2 哪邊找 $7.5M

- 30 個用戶 × 平均 $250K = $7.5M(高淨值用戶)
- 或 1500 個用戶 × 平均 $5K = $7.5M(零售)

第一條(高淨值)比較實際,但市場小。第二條(零售)需要做品牌信任,1-2 年的事。

### 11.3 V0 退路的 break-even

如果律師判定要退 V0(只 AAVE V3 + 手動選):
- dev / 運營成本砍半:$30K / year
- net APY 4.0% × 15% = 0.6% perf fee
- break-even = $30K / 0.6% = **$5M**

→ V0 退路在數字上比 V1 還可行,但成長性差。

---

## 12. 未決事項

寫到這裡有幾個問題沒答案,要排在 PoC Phase 3 期間 / 律師會面前確認:

- [ ] **Tron USDT-TRC20 ↔ EVM USDT 的稅務**(用戶在 Tron 入金、實際在 EVM 賺,扣繳怎麼算?)
- [ ] **multi-sig / MPC for EVM HOT**:V1 要不要先用 Gnosis Safe?還是延 V2?
- [ ] **預算**:律師費 + Nexus Mutual cover + bridge 失敗準備金,具體預算?
- [ ] **競品分析**:Yearn / Idle / Beefy 在台灣是否有運營?他們怎麼處理稅務 / 法律?
- [ ] **users 退費**:如果 V1 上線後 1 個月律師說違法要關,用戶資金怎麼撤?(critical exit plan)

---

## 13. 下一步 action

1. ✅ commit 這份 plan
2. 開始 Phase 3 PoC #1: AAVE V3 Polygon read-only
3. 並行:**找律師預約**(這是時間瓶頸,要 W7 前完成意見書)
4. PoC #1 完成後 stop-and-review,看要不要繼續 #2-4

---

_Last updated: 2026-05-01_
