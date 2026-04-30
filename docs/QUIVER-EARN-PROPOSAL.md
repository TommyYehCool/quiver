# Quiver Earn — Pivot Proposal

> 從「USDT 託管錢包」演進為「DeFi 收益聚合器」的詳細產品規劃 + 技術評估 +
> 損益試算 + 上線前法務檢查清單。
>
> Status: Proposal (尚未 commit 到 ROADMAP);需在跟律師諮詢後才推進實作。

---

## 1. 戰略定位與核心價值

### 一句話定位

> 把 USDT 放進 Quiver,我們幫你在最適合的 DeFi 協議生息 — 不用懂區塊鏈、
> 不用付鏈上手續費、隨時可贖回。

### 三條紅線(我們**不**做的事)

1. ❌ **不承諾固定收益** — 顯示「JustLend 當前 APY 8%」,不寫「保證 8%」
2. ❌ **不主動代操** — 用戶必須主動 opt-in、簽風險告知書、按下「存入」按鈕
3. ❌ **不混合用戶資金** — 內部 ledger 嚴格切分,鏈上盡量用獨立子地址

### 跟現有 Quiver 的契合度

| 現有 module | 在 Earn 怎麼用 |
|---|---|
| KYC | 直接套用,Earn 屬於「敏感動作」需 KYC 過 |
| ledger | 加新 ledger entry types:`EARN_DEPOSIT` / `EARN_WITHDRAW` / `EARN_INTEREST` / `EARN_FEE` |
| HOT / COLD wallet | HOT 變成「Earn 部位執行錢包」;COLD 仍是離線冷儲 |
| FEE_PAYER | 替用戶付 deposit/redeem 的 TRX gas |
| 2FA | Earn 操作沿用 transfer/withdraw 的 TwoFA gate |
| audit log | 記每筆 Earn 操作 |
| ConfirmDialog | Deposit / withdraw 確認用 |

→ **80% plumbing 已經有,新增 ~20% 的協議 integration 邏輯 + UI**。

---

## 2. 收費模式與獲利方式

### 主收費:Performance Fee 15%

```
用戶存 1,000 USDT
JustLend 一年付 8.0% APY = 80 USDT 利息
Quiver 抽 15% = 12 USDT
用戶實拿 68 USDT (= 6.8% net APY)
```

- 業界標準:Yearn 20% / Idle 10-20% / Beefy 4-9%(複雜策略才 9%)
- 15% 是「親民版」起跳價,等用戶基數夠了再考慮加價或多協議差別費率

### 次收費(可選)

| 方式 | 說明 | 推薦? |
|---|---|---|
| Deposit fee | 每筆存入 0-0.5% 或固定 1 USDT | ❌ 不建議起跳就收(降低嘗試門檻) |
| Withdraw fee | 每筆贖回 0.1% 或固定 1 USDT | ⚠️ 可考慮(cover gas 成本) |
| Premium 會員 | $5-10/月解鎖跨協議 rebalance / 稅務匯出 | ⏸ 等規模大再加 |
| Affiliate fee | 協議的推薦 program 回饋 | ✅ 隱藏收入,不額外向用戶收 |
| Spread / markup | 顯示低 APY 自己吃差價 | ❌❌❌ 強烈拒絕,信任崩盤 |

### 為何 Performance Fee 是最佳起點

- ✅ 用戶**零入場成本**,試試看的心理門檻最低
- ✅ 動機完美對齊:用戶賺多 = 我們賺多
- ✅ 透明可驗證:鏈上 APY 公開,抽成在 ToS 寫清楚
- ✅ 規模化好:linear with TVL,不用一直拉新提領單

---

## 3. MVP Feature Spec

### Phase 1 — MVP (~4-6 週)

**目標:單一協議(JustLend USDT)端到端可用**

**Frontend**
- `/earn` 新頁面(放在主 nav,KYC 過才顯示)
- Earn dashboard:
  - 「賺取中」總額(USDT)+ 當前 net APY
  - 累積利息(分今日 / 本週 / 本月 / 全部)
  - 圖表:過去 30 天每日累積利息
  - 「存入」/「取出」按鈕
- 第一次 opt-in 風險揭露 modal(必勾 3 個 box)
- 協議列表(初期只 1 個):
  - Real APY(JustLend 鏈上即時)
  - Your net APY(扣 15% perf fee)
  - TVL、稽核狀態、過去事故、預計贖回時間
- 在 dashboard 餘額卡加「賺取中:X USDT」分項

**Backend**
- 新 schema:
  - `earn_positions`(user_id, protocol, principal, j_token_amount, deposited_at)
  - `earn_events`(position_id, type=DEPOSIT/WITHDRAW/INTEREST_CLAIM, amount, fee, tx_hash, created_at)
- `EarnPosition` 計算當前價值(用 jUSDT exchange rate)
- API endpoints:
  - `GET /api/earn/protocols` — 可用協議列表 + APY
  - `GET /api/earn/positions` — 我的部位
  - `POST /api/earn/deposit` — 存入(2FA gated)
  - `POST /api/earn/withdraw` — 贖回(2FA gated)
- arq jobs:
  - `earn_execute_deposit` — 從 HOT 簽 supply tx 給 JustLend,記 jUSDT 收到的數量
  - `earn_execute_withdraw` — 簽 redeem tx
  - cron `earn_settle_interest`(每天 03:30):計算各部位產生的利息、抽 perf fee、更新 ledger
- audit log:每筆 deposit / withdraw / settle 都記

**Admin**
- `/admin/earn` 新頁面
  - 平台 TVL
  - 平台累積收的 perf fee 總額
  - 各協議部位數 + 總額
  - 近期 deposit / withdraw events

**Operational**
- 同樣的 reconcile cron 加上 Earn:鏈上 jUSDT × exchange rate vs ledger 對得上
- Sentry 加 Earn-specific events(JustLend 互動失敗、APY 突然 < 0、TVL 突降等)

### Phase 2 — 多協議(+4 週)

- 加 AAVE V3(Polygon 或 Arbitrum)— 跨鏈 bridge 整合
- 加 Compound V3
- 用戶介面顯示「最佳化建議」(現在你的 USDT 在 JustLend 6.8%,AAVE 8.5%,要不要切換?)
- 手動切換協議(用戶簽,不自動)

### Phase 3 — 進階(+持續)

- Auto-rebalance bot(用戶設定 policy,系統自動執行)
- 多幣種(USDC、TUSD、DAI)
- Premium 會員制
- 稅務報表 PDF / CSV(整年利息 + 平台費 + 預估海外所得)
- Limit orders / 條件式部署("APY > 6% 才存,< 4% 自動贖回")

---

## 4. JustLend Integration 技術細節

### JustLend 是什麼

- Tron 上的 lending 協議,類似 Compound v2 的 fork
- USDT supplier 拿到 jUSDT(interest-bearing token,exchange rate 隨時間漲)
- 不像 AAVE 採 rebasing token,這是「price-up token」

### Mainnet 合約

| 合約 | 地址 |
|---|---|
| JustLend Comptroller | `TGjYzgCyPobsNS9n6WcbdLVR9dH7mWqFx7` |
| jUSDT(USDT supply token) | `TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd` |
| USDT(Tether,參考) | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |

> 上線前一定要去 [JustLend 官方文件](https://docs.justlend.org/) 重新 verify
> 地址 — 寫死在程式碼前要再確認一次,被釣魚地址換掉就完蛋。

### 核心 contract methods

```solidity
// JustLend 合約 (jUSDT) — Compound v2 ABI
function mint(uint256 amount)              // supply USDT, 拿 jUSDT
function redeemUnderlying(uint256 amount)  // 贖回固定 USDT 數
function redeem(uint256 jTokens)           // 贖回固定 jUSDT 數
function balanceOf(address)                // 你的 jUSDT 餘額
function exchangeRateStored()              // 不更新利息直接回的 rate
function exchangeRateCurrent()             // 即時計算後的 rate(non-view)
function supplyRatePerBlock()              // 當前 supply APR (per block)
```

### 利息計算

```
位置價值 (USDT) = 你的 jUSDT × exchangeRateCurrent()

APY = (1 + supplyRatePerBlock / 1e18) ^ blocksPerYear - 1
    其中 Tron blocksPerYear ≈ 10,512,000(3 秒一個 block)
```

### 程式碼路徑

新增 `apps/api/app/services/earn/`:
- `justlend.py` — 包合約呼叫(`tronpy` 已經有,可以直接呼叫 contract method)
- `protocol_registry.py` — 抽象介面,讓 Phase 2 加 AAVE/Compound 時 reuse
- `position_accounting.py` — 計算每個用戶部位當前價值、settle 利息、抽 perf fee
- `service.py` — 高層 API 包裝(deposit / withdraw / settle)

```python
# 使用 tronpy 互動 JustLend(範例)
from tronpy import Tron
from tronpy.keys import PrivateKey

client = Tron(network="mainnet")
contract = client.get_contract(JLEND_JUSDT_ADDRESS)

# Supply: 1) approve USDT 給 jUSDT contract  2) mint(amount)
# (這個流程要走 2 步,跟現在的 USDT transfer 不同)

txn = (
    contract.functions.mint(amount_in_minor_units)
    .with_owner(hot_wallet_address)
    .fee_limit(100_000_000)  # 100 TRX fee limit
    .build()
    .sign(priv_key)
    .broadcast()
)
```

### 重要架構決策

#### A. 一個 HOT 替全用戶 lend(MVP 推薦)

```
所有用戶 USDT → 進 HOT → HOT 一次 mint() jUSDT
ledger:Alice 30%、Bob 70% pro-rata
鏈上:HOT 持有 jUSDT,看不出個別歸屬
```

- ✅ MVP 簡單、gas 成本低
- ⚠️ 用戶不能在 Tronscan 自己 verify 倉位
- ⚠️ 一旦 HOT 私鑰外流 → 全戶資金有風險
- 緩解:HOT 私鑰已 envelope encrypted、不在 admin 機器、要簽才解密

#### B. 每個用戶一個地址 lend(Phase 2+)

- ✅ Tronscan 用戶可自己 verify
- ❌ 每個用戶 deposit / withdraw 都要付 gas → FEE_PAYER 成本大幅上升

→ MVP 走 A,等 TVL > $1M 再評估遷移到 B

### Testnet 怎麼測

JustLend **沒有 Shasta / Nile testnet 部署**(社區普遍直接 mainnet 測小額)。
建議分三階段:

1. **Mock service** — 寫 `MockJustLendService` 模擬 supply / redeem / 利率,本地 e2e 測流程邏輯
2. **Mainnet smoke** — 用 admin 帳號自己存 5 USDT 真實上鏈,驗整套流程
3. **內測**(closed beta)— 開放給少數朋友 deposit < 100 USDT 試一週

---

## 5. UX Flow

### 第一次使用 Earn

```
[Earn] tab(KYC 過才看到)
  ↓
首次點 [存入]
  ↓
Modal:風險揭露
  - 「JustLend 是去中心化協議,合約若被駭你的 USDT 可能損失」(必勾)
  - 「APY 隨市場波動,不保證任何收益」(必勾)
  - 「Quiver 收 15% 績效費」(必勾)
  - 「我已閱讀並同意 Earn 服務條款」(連結到 ToS)
  ↓
[輸入金額] [預估利息]
  - 「現在 JustLend USDT APY:8.0%(扣 15% 績效費後 6.8%)」
  - 「你存 100 USDT,一年約賺 6.8 USDT(隨 APY 變動)」
  ↓
[2FA verify](TOTP 6 位)
  ↓
Worker 執行 supply tx → 顯示「處理中(~2 分鐘)」
  ↓
完成:「✅ 已存入 100 USDT 到 JustLend,正在賺取中」
```

### Earn dashboard

```
┌─────────────────────────────────────────┐
│ 賺取中: 500 USDT                         │
│ 當前 net APY: 6.8%                      │
│ 累積利息: 12.34 USDT (+0.20 今日)       │
│ ┌─────────────────────────────┐         │
│ │ [圖表] 過去 30 天每日累積    │         │
│ └─────────────────────────────┘         │
│ [存入] [取出]                            │
└─────────────────────────────────────────┘

協議:
┌─────────────────────────────────────────┐
│ JustLend USDT                            │
│ Real APY: 8.0%  Your net: 6.8%          │
│ TVL: $250M  Audited: ✓ Halborn          │
│ ✓ 你目前存在這 (500 USDT)                │
└─────────────────────────────────────────┘
```

### 贖回 flow

```
[取出]
  ↓
輸入金額(可選「全部」)
  ↓
顯示明細:
  - 將贖回:100 USDT
  - 對應利息:1.50 USDT
  - 平台 perf fee(15%):0.225 USDT
  - 你實收:101.275 USDT
  ↓
[2FA verify]
  ↓
Worker 執行 redeemUnderlying() → ~2 分鐘 → USDT 進你 Quiver 餘額
```

---

## 6. 風險揭露策略

### 風險揭露的位階

1. **入場第一次** — 必勾 modal,不勾不能用
2. **每次大額存款 (≥ $5K)** — 加長版風險摘要
3. **協議列表常駐** — 每個協議旁邊 ⓘ icon 點開看「TVL / 過去 12M APY / 是否被駭過」
4. **ToS 服務條款** — 詳細法條(找律師 review)
5. **Earn FAQ 頁** — 常見問題、教育型內容

### 必揭露項目

```
1. 智能合約風險
   JustLend 是第三方去中心化協議,程式碼若有漏洞或遭駭客攻擊,你的 USDT
   可能部分或全部損失。Quiver 不擁有也不維護該合約。

2. 無保證收益
   顯示的年化收益率(APY)是市場供需即時計算結果,可能在你存入後立即下降,
   甚至降至接近 0。歷史 APY 不代表未來表現。

3. 流動性風險
   一般情況下贖回為即時,但極端市場條件下(例如協議 utilization > 95%)
   可能延遲或暫時無法贖回。

4. 平台費用
   Quiver 對你獲得的利息收取 15% 績效費,於每次贖回或每月結算時計算。
   不對本金收費,不收年費。

5. 對手方風險
   USDT 本身由 Tether 公司發行,USDT 與 1 美元的掛鉤(peg)由 Tether 維持,
   非 Quiver 或 JustLend 控制。歷史上 USDT 曾出現短暫脫鉤事件。

6. 法規風險
   加密資產法規仍在演進,未來主管機關規定可能影響本服務的可用性,
   屆時 Quiver 將協助用戶贖回但不對因法規變動造成的延遲負責。

7. 平台不擔責聲明
   Quiver 提供「介面 + 執行」服務,不是投資顧問,不對 JustLend 等第三方
   協議的安全性、表現或事故承擔法律或財務責任。
```

---

## 7. 損益試算 / Break-even Analysis

### 月固定成本估算(USD)

| 項目 | 起步 | 規模化 |
|---|---|---|
| Server hosting (api+worker+db+redis) | $80 | $300 |
| Tatum API(mainnet 付費 plan) | $100 | $400 |
| Sentry | $0(free tier) | $30 |
| S3 backup | $5 | $20 |
| Domain + SSL | $1 | $1 |
| 雜項(notifications、monitoring) | $20 | $50 |
| **總月成本** | **$206** | **$801** |

不含人力成本(假設你自己時間 not counted)。

### 收入公式

```
月收入 = TVL × Performance Fee × APY ÷ 12
       = TVL × 15% × 8% ÷ 12
       = TVL × 0.001 (= 0.1% 月)
```

### Break-even TVL 計算

| 月成本 | 需要 TVL |
|---|---|
| $200 | $200K(20 萬美金) |
| $400 | $400K |
| $800 | $800K |

若 APY 下降到 5%:
| 月成本 | 需要 TVL |
|---|---|
| $200 | $320K |
| $400 | $640K |

### 用戶成長假設

**樂觀情境(月 50% 複合成長,4 個月達 break-even)**

| 月份 | 用戶數 | 平均存款 | TVL | 月收入 | 月損益 |
|---|---|---|---|---|---|
| 1 | 30 | $500 | $15K | $15 | -$185 |
| 2 | 50 | $800 | $40K | $40 | -$160 |
| 3 | 80 | $1,200 | $96K | $96 | -$104 |
| 4 | 130 | $1,500 | $195K | $195 | -$5 ← break-even |
| 6 | 250 | $2,000 | $500K | $500 | +$300 |
| 12 | 600 | $2,500 | $1.5M | $1,500 | +$1,300 |

**保守情境(月 20% 複合成長,9-10 個月達 break-even)**

| 月份 | 用戶數 | 平均存款 | TVL | 月收入 | 月損益 |
|---|---|---|---|---|---|
| 1 | 30 | $400 | $12K | $12 | -$188 |
| 3 | 50 | $700 | $35K | $35 | -$165 |
| 6 | 90 | $1,200 | $108K | $108 | -$92 |
| 10 | 180 | $1,600 | $288K | $288 | +$88 ← break-even |
| 12 | 220 | $1,800 | $396K | $396 | +$196 |

### 關鍵觀察

1. **Break-even 不需要爆量用戶** — 200-400 個活躍用戶 + $1-2K 平均存款就能 cover 基礎營運
2. **規模 retention 是關鍵** — DeFi 用戶一旦習慣,resistance to change 高,LTV 高
3. **早期可以「自食」**(用個人資金 deposit $50K-100K 維持 TVL)— 但這把自己暴露在協議風險,要評估
4. **CAC 控制決定速度** — 如果靠口碑 / 內容行銷,CAC ≈ $0;如果跑廣告,每 user 拉到要 $20-50,得算進去

### 上行情境(APY 漲時暴利)

DeFi 利率有極端波段。極端情況例:
- 牛市時 stablecoin 借貸需求大,JustLend USDT APY 可達 15-20%
- 在這種環境 TVL $300K 一年就能跑出 $9K 平台收入

但反過來熊市可能 USDT APY 跌到 2-3%,規模沒大就難 cover 成本。

→ 建議持有 6-12 個月 runway 的儲備金。

---

## 8. 律師諮詢檢查清單

> 找專精加密資產的台灣律師(例如:**KPMG 區塊鏈組、明理法律、勤業眾信、廖經堯律師、蔡宏緯律師**等)。
>
> 諮詢前先帶上這份清單 + Quiver 現有功能描述 + 提案書,效率會高很多。

### A. 業務分類(最重要)

- [ ] **Quiver Earn 在台灣監管框架下屬於何種業態?**
  - 是 VASP(虛擬通貨平台事業)的延伸?
  - 是投資顧問業務?
  - 是準銀行業務(收受存款 + 給付利息)?
  - 是「以技術仲介(intermediary)」非金融業?
- [ ] 如果用戶 USDT 透過智能合約進入 JustLend,我們**只執行**(不託管),**不承諾固定利息**(只顯示市場 APY),仍可能被認定為「準銀行」嗎?
- [ ] 「Performance fee 15% 績效費」是「投資顧問報酬」還是「服務費」?哪一種牌照?

### B. 銀行法 / 信託法

- [ ] **銀行法第 29 條**:「除法律另有規定者外,非銀行不得經營收受存款……業務」。我們的 Earn 服務是否觸發?
- [ ] 如果觸發,有哪些豁免條款 / 商業安排可以避開?
  - 例如:全部資金透明上鏈(每一筆 deposit 都對應鏈上 tx)
  - 例如:用戶可隨時贖回(不像存款有期限)
  - 例如:不承諾本金或利息(寫進 ToS)
- [ ] 信託法是否相關(用戶把 USDT 給 Quiver 視為信託?)

### C. 投資顧問 / 投信法規

- [ ] 「我們替用戶選擇最佳協議」是否需要投顧牌照?
- [ ] 若改成「我們列出多個選項,用戶自行選擇」,是否就免於投顧法規?
- [ ] 「自動 rebalance」(Phase 3)是否觸發代客操作?

### D. 反洗錢 / KYC

- [ ] 既有 KYC(身分證 + 自拍)是否符合 FSC 對 VASP 的要求?
- [ ] **Earn 業務的單筆 / 累計門檻**:
  - 入金超過 NTD 50 萬 (~$16K) 是否需 EDD?
  - 一定額度內是否可豁免?
- [ ] 用戶從 Earn 贖回後提到外部錢包,反洗錢申報義務?
- [ ] 可疑交易申報的判定標準?

### E. 風險揭露 / 條款保護

- [ ] **風險揭露條款的法律效力**:
  - 用戶簽了 ToS,JustLend 被駭後用戶能否仍向 Quiver 索賠?
  - 怎樣的條款設計能最大化平台保護?
- [ ] 服務條款必須包含哪些**法定揭露項目**?
- [ ] 無線上下單的「電子簽章」 / 同意 button 點擊在台灣有何法律效力?

### F. 稅務

- [ ] 用戶在 Earn 賺到的利息,稅務分類:
  - 「所得稅法」中是「孳息所得」、「海外所得」、「綜合所得」、還是其他?
  - 海外所得 NTD 100 萬以下免申報的規定是否適用?
- [ ] Quiver 收的 15% performance fee:
  - 是「服務費」(課 5% 營業稅) 還是「投資顧問費」?
  - 是否要為用戶開立扣繳憑單 / 海外所得申報資料?
- [ ] 公司本身收到的 perf fee(假設用 USDT 結算)如何認列?
  - 收到 USDT 那刻按市價認列收入?
  - 換成 TWD 時的匯損 / 匯兌利益?

### G. FEE_PAYER 代付 gas

- [ ] Quiver 用 platform 帳戶替用戶付 TRX gas:
  - 對用戶來說算「附帶利益」嗎?是否計入用戶收入?
  - 對 Quiver 來說是「服務成本」還是「禮品支出」?
  - 是否需在 ToS 揭露?

### H. 行銷 / 廣告

- [ ] 廣告詞限制:
  - 不能說「保證」、「穩賺」、「無風險」
  - 但「歷史平均 APY 8%」可不可以說?
  - APY 顯示是否需附「歷史不代表未來」聲明?
- [ ] 是否屬於金融商品廣告,要送主管機關備查?

### I. 跨境 / 跨地域

- [ ] **Quiver 公司在台灣註冊,但 USDT 部位在 Tron 鏈(無國界)、JustLend 是境外協議**:
  - 這算「跨境金融服務」嗎?
  - 主管機關管轄權範圍?
- [ ] 如果有非台灣國籍用戶:
  - 美國公民完全不能用(SEC 風險)
  - 中國公民?新加坡?日本?
  - 怎麼合理地 geo-block?

### J. 保險 / 救濟機制

- [ ] DeFi 智能合約保險(Nexus Mutual、InsurAce)若購買 cover,
  - 若協議真的被駭,理賠款是直接給用戶還是進 Quiver 帳戶再分配?
  - 怎麼設計才能讓用戶實質受益?
- [ ] 平台破產時用戶資產處置:
  - 因為 USDT 在 JustLend 合約內,理論上跟平台破產無關
  - 這個邏輯能否寫進條款保護用戶免於債權人爭奪?

### K. 監管變動退場機制

- [ ] 若 FSC 未來規定關閉此類業務:
  - 通知期 / 強制贖回程序怎麼設計?
  - 用戶沒贖回的 USDT 怎麼處置(退到 Quiver 餘額?強制送回外部地址?)
- [ ] 如何持續追蹤監管動態避免被動關門?

### L. 公司架構 / 責任區隔

- [ ] 是否需要把 Earn 業務獨立成子公司 / 不同法人?
- [ ] 個人董事責任(刑事)範圍?
- [ ] 萬一被盜用戶 USDT 損失,責任歸屬?

---

## 9. Open Questions / 待決定

跟律師討論完才能拍板的:

1. **要不要走律師路徑** — 諮詢費約 NTD 5-15K / 小時,初次評估約 NTD 30-100K。
2. **產品要不要先發內測 vs 等律師結論** — 律師通常 1-2 個月才有完整意見,期間可以先做技術 PoC + 朋友圈內測。
3. **目標 TVL** — 設保守還是激進?影響營運 buffer 配置。
4. **第一個協議要不要**真的就** JustLend** — 對 / 還是對社區更知名的(AAVE 雖貴但更被信任)?

跟你討論完才能寫進去的:

5. **要不要做手機 App** — Phase 7 跟 Earn 哪個優先?個人意見:Earn 商業價值高,Mobile 是渠道 — Earn 先,Mobile 跟著(因為 Earn 體驗在 Mobile 上更好賣 yield 數字)。
6. **要不要走 token / 平台幣** — 不建議,純添麻煩(SEC 風險、TW 法規模糊)。先靠收入經營到穩定。

---

## 10. 推薦的下一步

### 立刻可做(不影響選擇)
- [ ] 找律師諮詢初評(發這份 doc + 預約 1-2 hr meeting)
- [ ] 我做一個 **JustLend integration PoC**(半天)— 確認技術可行性、抓 mainnet 真實 APY、用 admin 帳號試存 5 USDT、贖回看流程
- [ ] 把 Quiver 現有 user / KYC base 跟「會用 yield 的目標客群」做一次 fit 評估

### 等律師意見後決定
- [ ] 業務上下游分類確定後決定 ToS 寫法
- [ ] 確認可不可推進到 close beta(內測)

### 規劃但不急
- [ ] 競品分析:Pionex、Hodlnaut(已倒)、CoinSquare、Nexo、Yearn、Beefy
- [ ] 行銷 plan(口碑 / 內容 / 社群)— 加密用戶在哪
- [ ] 客服 plan(用戶遇到問題誰回?)

---

## 附錄:技術 reference

- JustLend docs:https://docs.justlend.org/
- Compound v2 (JustLend 是它 fork):https://docs.compound.finance/v2/
- AAVE V3:https://docs.aave.com/developers/
- tronpy(Python Tron SDK):https://tronpy.readthedocs.io/
- 加密保險:https://nexusmutual.io/, https://www.insurace.io/
- DeFi Llama(看 TVL / APY 比較):https://defillama.com/yields

---

> Status:**討論中,未進 ROADMAP**
> 等律師意見 + 你的決策後才會排進實作。
