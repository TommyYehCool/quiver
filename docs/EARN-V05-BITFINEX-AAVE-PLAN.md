# Quiver Earn V0.5 — Bitfinex Funding 為主、AAVE 為輔

> **Status**: Plan locked, 與 V1 multi-protocol plan 並列為候選
> **Decision date**: 2026-05-01
> **Companion docs**: `EARN-V2-MULTIPROTOCOL-PLAN.md`(V1 純 DeFi 4 協議方案)
> **目的**: 把 Bitfinex Funding 的高 APY 納入,但用窄範圍降低法律 / 工程複雜度

---

## TL;DR

不做 4 協議 DeFi aggregator(V1),改做窄而深的 **2-strategy 組合**:

- **Strategy A — Bitfinex Funding (USDT/USD lending)**:目標 70% 部位,APY 7-15%(波動)
- **Strategy B — AAVE V3 Polygon**:目標 30% 部位,APY ~5%(穩定)

優勢(vs V1 4-protocol):
- 工程複雜度降 50%(2 個 strategy vs 4 個 + bridge)
- **Bitfinex 直接收 USDT-TRC20**(用戶資金不用跨鏈)
- 預期 blended net APY 6-9%(扣 15% perf fee 後),高於 V1 的 ~3-4%
- 律師故事更清晰:「分散在 1 個 CEX lending market + 1 個 DeFi protocol」

劣勢:
- 70% 部位集中 Bitfinex → counterparty risk 集中
- Funding APY 波動大(rate 可能從 15% 跌到 3%,用戶體驗會抖)
- 仍是 CEX,有 Celsius/BlockFi 結構性風險,只是 Bitfinex 風險小於一般 Earn

---

## 1. 為什麼選 Bitfinex Funding 而不是 Binance Earn

| 項目 | Bitfinex Funding | Binance Simple Earn |
|---|---|---|
| 結構 | **借給其他 Bitfinex 用戶**(margin trader),Bitfinex 是中介+清算 | **借給 Binance**,Binance 拿去做(不公開) |
| Counterparty | 借款人 + Bitfinex 強平機制 | Binance 本身 |
| 透明度 | API 公開即時 rate / depth,**借出後 onchain-like 可查狀態** | 黑箱 |
| 破產隔離 | 11+ 年無破產紀錄,2016 hack 後重組,Funding 部位有 user-level segregation | Binance 是大型 prop desk,re-hypothecation 不公開 |
| APY 來源可解釋 | 「margin trader 借錢做 leveraged trading 付的利息」 | 「Binance 給你的」 |
| 監管狀態 | BVI / iFinex,被 NYAG 罰過(2021)但仍存活 | 多國禁、中國禁、美國 SEC 在告 |
| 給律師的故事 | **「我們幫用戶接觸機構級 lending market」**,可解釋 | **「我們把錢給 Binance」**,律師會直接擋 |

→ Bitfinex Funding **不算「給 CEX」**,算「**用 CEX 當 matchmaker 借給 margin trader**」,法律定位更接近 P2P lending platform。

---

## 2. Bitfinex Funding 機制詳解

### 2.1 流程

1. **Deposit**: 把 USDT-TRC20 存到 Bitfinex(直接支援,免 bridge)
2. **Funding wallet**: 從 Exchange wallet 移到 Funding wallet
3. **Submit offer**: 設定利率 + 期間(2-30 天),掛單
4. **Match**: 等 margin trader / leveraged trader borrow 走
   - 也可選 **Auto-Renew (FRR)**,匹配當下 Flash Return Rate
5. **Earn**: 每日結息,進 Funding wallet 餘額
6. **Withdraw**: offer 到期 / cancel + funds idle 後可提

### 2.2 APY 結構

- **Flash Return Rate (FRR)**: 系統根據供需決定的「即時市場利率」
- **2026 觀察 USDT FRR**: 0.02-0.08% / day(約 7-30% 年化)
- **2026 觀察 USD FRR**: 0.04-0.12% / day(15-44% 年化,因 USD 流動性少、需求大)
- 重大行情 BTC 大漲 / 大跌時 FRR 飆高(margin demand 暴增)
- 平靜期 FRR 跌到 5-7% 年化

→ **長期平均估 ~10% APY**(USDT)是中性假設,可能更高也可能更低。

### 2.3 Bitfinex Funding 的真實風險

#### A. Counterparty:借款人違約
- Bitfinex 強制 maintenance margin 13%,觸發 auto-liquidation
- 借款人爆倉時 Bitfinex Insurance Fund 兜底
- 歷史上(11 年)**沒發生**社會化損失分攤,但**理論上極端行情可能要 socialize**(類似 Bitfinex 2016 hack 後的 BFX token 處理)
- 風險量化:< 1% / year(個人估算)

#### B. Bitfinex 平台本身倒閉
- iFinex (Bitfinex 母公司) 跟 Tether 同集團,Bitfinex 倒 = Tether 倒,USDT 大規模脫鉤
- 「Bitfinex 倒,USDT 也完了」 = Quiver 整盤 game over,但這是大盤面風險,不是 Bitfinex 特定風險
- 風險量化:< 0.5% / year(極端,但發生時整個業界都死)

#### C. NYAG / 美國監管再施壓
- 2021 年 NYAG 跟 iFinex 達成 $18.5M 和解,**禁止 Bitfinex 服務 NY 用戶**
- 未來如果美國繼續壓 → Bitfinex 可能限制美國以外某些國家(包含台灣?未知)
- 風險量化:中,需要監控

#### D. Funding 市場流動性消失
- 行情冷靜時 Funding 需求暴跌 → APY 從 15% 跌到 2%
- Quiver 用戶會看到 APY 下滑,但**本金不會虧**
- 處理:當 Funding APY < AAVE APY 時,自動把 Funding 部位移到 AAVE

#### E. API 中斷 / 限制
- Bitfinex 偶爾 maintenance(每月幾次,各 1-2 hr)
- API rate limit 80 req/min(偏緊但夠用)
- 如果 IP 被 ban → 部位卡住,要靠 web UI 人工處理(營運風險)

---

## 3. AAVE V3 Polygon — 為什麼選它做輔

放 30% 部位的目的不是賺錢,是**對沖 Bitfinex 集中風險**:

- 100% on-chain transparent
- TVL $1.2B,單一協議最大
- 萬一 Bitfinex 出事 → 還有 30% 在 AAVE 沒倒
- 律師故事好聽:「Quiver 讓用戶分散到 CeFi + DeFi」

技術細節跟 V1 plan 同(`EARN-V2-MULTIPROTOCOL-PLAN.md` § 1.1)。

---

## 4. 架構

```
┌─────────────────────────────────────────────────────────────┐
│  User (Tron USDT-TRC20)                                     │
│  ↓ deposit                                                   │
│  Tron HOT (Quiver,所有用戶共用)                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                            │
  (admin manual                (admin manual
   Bitfinex deposit:            bridge to Polygon
   Tron USDT 直接送)              via Allbridge or Binance)
        │                            │
        ▼                            ▼
┌─────────────────────┐    ┌──────────────────────────┐
│  Bitfinex           │    │  Polygon HOT             │
│  Funding wallet     │    │  (Quiver 持有 USDT-ERC20) │
│  (70% 部位)          │    │  ↓                        │
│  ↓ submit offer     │    │  AAVE V3 Pool            │
│  Lent to margins    │    │  (30% 部位,aPolUSDT)     │
└─────────────────────┘    └──────────────────────────┘
```

**核心**:
- 用戶看到的「我有 1000 USDT 在 Quiver Earn」是內部記帳
- 實際資金分散在 Tron HOT (流動性) + Bitfinex Funding + AAVE Polygon
- Quiver 後勤每週 rebalance,用戶不需操作
- **bridge 只用在 AAVE 端**(30% 部位),Bitfinex 端完全不用 bridge(Tron USDT 直送)

---

## 5. 部位分配與 rebalance

### 5.1 目標部位(初期)

| 用途 | 比例 | 在哪 |
|---|---|---|
| **流動性緩衝**(用戶提領) | 20% | Tron HOT |
| **Bitfinex Funding** | 55% | Bitfinex Funding wallet(部分掛單、部分已 lent) |
| **AAVE V3 Polygon** | 25% | aPolUSDT |

### 5.2 動態 rebalance 規則

**每日 cron (00:00 UTC)**:
1. 抓當前:
   - Bitfinex FRR (USDT) → API
   - AAVE V3 Polygon supply rate → on-chain
2. 計算「最佳分配」:
   - 如果 `Bitfinex_APY > AAVE_APY × 1.5` → 維持 70/30
   - 如果 `Bitfinex_APY 介於 AAVE_APY × 1.0-1.5` → 調到 60/40
   - 如果 `Bitfinex_APY < AAVE_APY` → 調到 40/60(防 Bitfinex 雞肋)
3. 計算 `gas + fee 成本 vs 預期 delta gain`,只在 payback < 14 天時搬

**入金 / 出金 lazy rebalance**:
- 入金的新 USDT 部署到當前更划算那邊
- 出金優先從 APY 較低那邊撤(maximize 留下高 APY)

### 5.3 Bitfinex 內部策略

Bitfinex 部位再細分:

| 子用途 | 比例 | 作法 |
|---|---|---|
| FRR Auto-Renew | 50% | 掛單 FRR + Auto-Renew,完全被動 |
| 固定 rate offer | 30% | 略高於 FRR 5-10%,等 borrower 急用時 match(賺 spread) |
| Funding wallet idle(可隨時提) | 20% | 確保 admin 隨時能撤回 |

**好處**:50% 永遠 lent → 持續產生利息;20% 可隨時撤 → 用戶提領流動性。

---

## 6. Bridge(只在 AAVE 端)

跟 V1 plan 同(platform-managed float),但**用量降到 1/4**:
- 只有 25% 部位需要跨鏈
- 不是每個用戶 deposit 都 bridge,而是 Quiver 每週 1 次 rebalance 時 bridge
- bridge 工具:**Binance withdraw** 為主(Quiver 把 Tron USDT 存 Binance,從 Binance withdraw 成 Polygon USDT)

→ V1 的 bridge 工程量(W5 + W6)在 V0.5 砍到 1 週。

---

## 7. Database Schema

跟 V1 同表結構,只是減少 protocols(`protocol_positions` 只有 2 row),增加 **bitfinex_funding_offers** 表:

```sql
CREATE TABLE bitfinex_funding_offers (
    id SERIAL PRIMARY KEY,
    bitfinex_offer_id BIGINT UNIQUE,    -- API 回傳的 offer ID
    symbol VARCHAR(8) NOT NULL,         -- "fUSDT"
    amount NUMERIC(38, 18) NOT NULL,
    rate NUMERIC(10, 8) NOT NULL,       -- daily rate (e.g. 0.0003 = 0.03%/day)
    period INTEGER NOT NULL,            -- days (2-30)
    status VARCHAR(16) NOT NULL,        -- "ACTIVE" / "MATCHED" / "EXPIRED" / "CANCELLED"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    matched_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE TABLE bitfinex_funding_earnings (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    symbol VARCHAR(8) NOT NULL,
    amount NUMERIC(38, 18) NOT NULL,    -- 該日結息
    UNIQUE (date, symbol)
);
```

---

## 8. UX(用戶看到什麼)

```
┌──────────────────────────────────────────┐
│  💰 你的存款                                │
│  $1,234.56 USDT                          │
│                                          │
│  📈 30 天平均 net APY: 7.84%              │
│  📊 累計利息: $58.30 USDT (扣 15% 後)      │
│                                          │
│  資金分散到兩個來源:                       │
│  ┌────────────────────────────────────┐ │
│  │ 🏦 Bitfinex Funding      68%       │ │
│  │    當前 yield ~10% APY             │ │
│  │    來源: 機構級 margin lending      │ │
│  ├────────────────────────────────────┤ │
│  │ ⛓️  AAVE V3 (Polygon)    32%       │ │
│  │    當前 yield ~5% APY              │ │
│  │    來源: 鏈上去中心化借貸           │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ⚠️ 風險告知                               │
│  Bitfinex 是中心化交易所,有平台風險        │
│  AAVE 是鏈上協議,有 smart contract 風險   │
│  過往報酬不代表未來。Quiver 不保證收益。   │
│                                          │
│  [存入 USDT]  [提領]                      │
└──────────────────────────────────────────┘
```

**強調**:
- 用戶看得到分配(透明)
- 兩個風險揭露**並列且各自描述**(不要混在一起)
- net APY 是 30 天平均(不是即時、不是預測)

---

## 9. V0.5 時間估算

| Week | 任務 | 完成標準 |
|---|---|---|
| **W1** | Bitfinex Funding API 整合 (auth, deposit, offer, list, withdraw) | Quiver 後台能掛 / 取消 offer,讀部位 |
| **W2** | AAVE V3 Polygon read+write adapter (testnet) | testnet supply / withdraw 跑通 |
| **W3** | Bridge: Binance withdraw 自動化(Quiver→Binance→Polygon) | admin 一鍵跑 bridge |
| **W4** | 內部記帳:user.virtual_position + reconciliation | 每日對帳成功,3 邊水位無 drift |
| **W5** | Auto-rebalance 演算法(2-strategy) + cron | 模擬 30 天歷史資料,rebalance 行為合理 |
| **W6** | UX:dashboard、deposit/withdraw、風險揭露 onboarding | 用戶可流暢操作 |
| **W7** | Mainnet smoke (1 USDT 全程跑) + 監控 / alerting | 真錢通過,監控完整 |
| **W8** | Beta 30 用戶 + bug fix + 文件 | 上線(beta) |

→ **8 週(2 個月)**(vs V1 multi-protocol 8-10 週)。

> ⚠️ **legal gate**:W5 開始前完成律師意見書;W8 上線前要有最終法律審。

---

## 10. 法律風險(V0.5 vs V1 對比)

| 議題 | V0.5 (Bitfinex+AAVE) | V1 (4 DeFi protocols) |
|---|---|---|
| 銀行法 § 29 | **較高**(70% 在 CEX,看起來像「為用戶接受存款再放貸」) | 中(全 DeFi,定位「工具」) |
| 集合資金管理 | 高(雙策略代管) | 高(4 策略代管) |
| Bitfinex 監管尾巴 | **特有風險**(NYAG / 美國監管再壓會波及我們) | N/A |
| smart contract 風險 | 低(只 1 個 protocol AAVE) | 高(4 個 protocols 各自風險) |
| stable coin 風險揭露 | 同 | 同 |
| 故事好不好說 | 「機構 lending + DeFi」**清楚** | 「DeFi yield aggregator」**清楚** |
| 天花板 | 低(70% 集中 Bitfinex,難擴) | 高(可加更多 DeFi 協議) |

### 律師關鍵問題(V0.5 特有)

在 `EARN-V2-MULTIPROTOCOL-PLAN.md` 的 20 個問題之外:

21. **Bitfinex Funding 的法律定性**:在 Quiver 收手續費時,我們是「P2P 平台」還是「資金管理者」?
22. **Bitfinex 是 CEX,但 Funding 是借給其他用戶**:法律上算「借給 CEX」嗎?(關鍵)
23. **如果 Bitfinex 被美國制裁、限制台灣用戶**,Quiver 如何撤資 + 賠用戶?
24. **NYAG 案件先例**:NYAG 認為 Tether 不透明,這個論述在台灣會不會被引用?
25. **Funding APY 波動到 30%**:會不會被認定為「保證高收益」即使我們不保證?

---

## 11. 商業數字重估

### 假設(中性)

- Bitfinex Funding USDT 平均 APY:**10%**
- AAVE V3 Polygon USDT:5%
- 部位分配:70% / 30%
- Blended APY:`0.7 × 10% + 0.3 × 5% = 8.5%`
- 扣 15% perf fee → **net APY 7.2%**
- Quiver 收 perf fee:`8.5% × 15% = 1.275%` of TVL / year

### break-even

- 月運營(infra + dev partial,V0.5 比 V1 簡單,假設):$3,500 / month → $42K / year
- break-even TVL = $42K / 1.275% = **$3.3M**

→ 比 V1 multi-protocol 的 $7.5M 低,**業務啟動門檻較容易過**。

### 找 $3.3M

- 13 個用戶 × 平均 $250K = $3.3M(高淨值)
- 或 660 個用戶 × 平均 $5K = $3.3M(零售)

---

## 12. 風險登記簿(V0.5 特有)

| 風險 | 機率 | 衝擊 | 緩解 |
|---|---|---|---|
| Bitfinex 平台倒 / 監管 ban | 低 | 致命 | 30% AAVE 對沖、上限單一交易所 80% 不超過、買 Nexus Mutual cover |
| Bitfinex Funding APY 跌到 < AAVE | 中 | 中 | auto-rebalance 切到 AAVE 為主、用戶 net APY 仍 ~5% |
| Bitfinex API 中斷 | 中(每月幾次) | 低 | API 重試 + manual fallback,不影響用戶提領(從 Tron HOT 出) |
| AAVE smart contract bug | 低 | 高 | 30% 上限、Nexus cover |
| Bridge hack(Binance/Allbridge) | 低 | 中 | bridge 量小(只 30%)、單次限額 |
| Funding offer 被借走但借款人爆倉造成 socialized loss | 極低 | 中 | Bitfinex 11 年無紀錄,但保留通知用戶條款 |
| Tron HOT 不夠時 Bitfinex 撤資要 1-3 hr | 中 | 低 | 預留 20% 流動性 + 提領排程 |
| 律師判定為違法 | 中 | 致命 | W5 前完成律師意見書,有 V0 退路(只剩 AAVE) |

---

## 13. V1 vs V0.5 vs V0 三方案選一

| 方案 | net APY (中性) | 工程週期 | 法律風險 | break-even TVL | 天花板 |
|---|---|---|---|---|---|
| **V1**: 4 DeFi protocols + auto-rebalance | ~3.5% | 8-10 週 | 中 | $7.5M | 高 |
| **V0.5**: Bitfinex 70% + AAVE 30% | **~7.2%** | **8 週** | **中-高** | **$3.3M** | 中 |
| V0: 只 AAVE V3 Polygon | ~3.5% | 4-5 週 | 低 | $5M | 低 |

### 三方案的取捨

- **V1**: 故事好(純 DeFi)、可擴展、但 APY 不夠迷人,難 onboard 第一批用戶
- **V0.5**: APY 最高、break-even 最低、**但 70% 押 Bitfinex 是雙面刃**
- **V0**: 法律最乾淨、最快上線、但 APY 跟競爭對手沒差別

我的建議:**律師會面前先做 V0 PoC(週末 1-2 天)**,確認 AAVE 整合可行後,再請律師同時看 V0/V0.5/V1 三案,讓律師告訴我們哪個能做。

---

## 14. PoC Phase 3 任務(V0.5 特化)

| # | 任務 | 工時 |
|---|---|---|
| 1 | AAVE V3 Polygon read-only(web3.py)| 半天 |
| 2 | **Bitfinex Funding API 認證 + 讀部位**(authenticated endpoint) | 半天 |
| 3 | Bitfinex 模擬 submit offer(用 testnet 假帳戶 / 我自己小帳戶 1 USD) | 半天 |
| 4 | Tron USDT 從 Quiver 到 Bitfinex 入金煙霧測試(1 USDT) | 半天 + ~$1 fee |
| 5 | 整合:`bitfinex.py + aave.py + strategy_manager.py` 雛形 | 1.5 天 |

→ 整個 Phase 3 V0.5 PoC 約 **3-4 天**(vs V1 5-7 天)

---

## 15. 未決事項

- [ ] Bitfinex 帳戶開立:Quiver 用主帳戶還是商業帳戶?
- [ ] Bitfinex 是否接受台灣公司 KYC?(歷史上有限制)
- [ ] Bitfinex Funding API 是否有 sub-account 支援(讓 Quiver 可以 per-user 隔離簿記)?
- [ ] 律師對「Bitfinex Funding ≠ 給 CEX 存款」的看法
- [ ] APY 波動造成用戶體驗問題:要不要做「smoothed APY」(7d MA)顯示?

---

## 16. 下一步 action

1. ✅ commit 這份 plan
2. 律師會面前先做 V0.5 PoC #1-2(AAVE read + Bitfinex authenticated read,1 天可完成)
3. 帶著 3 份 plan(V1 / V0.5 / V0)+ PoC 結果去找律師
4. 律師判定後選 1 個方案進入 V1

---

_Last updated: 2026-05-01_
