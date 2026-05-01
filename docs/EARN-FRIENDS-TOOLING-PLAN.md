# Quiver Earn — Friends Tooling Plan(非商業、無收費,但架構已 future-proof)

> **Status**: 規劃完成,可立即啟動(無律師阻塞)
> **Companion**: 跟 `EARN-V05-BITFINEX-AAVE-PLAN.md` 並列另一條軸線,但**共用同一份 schema 和 code**
> **目的**: Tommy + 朋友各自用自己的帳戶,Quiver 當「儀表板 / ops 工具」,**不收費、不混合資金**;**未來 V0.5 商業化時零搬遷**

---

## TL;DR

**完全不需要律師意見書**就能做的東西。法律定位:**朋友間共享工具**,類比於「我寫個 Excel 給朋友追蹤股票」。

| 項目 | 商業 V0.5 | 個人(路徑 2) | **朋友 tooling(本 plan)** |
|---|:---:|:---:|:---:|
| 用戶模型 | 公開 | 只你 | **限定朋友(<10 人)** |
| 收手續費 | 15% perf | 無 | **無** |
| 資金 commingling | 是 | 否 | **否(各自帳戶)** |
| 律師意見書 | 必須 | 不需要 | **不需要** |
| 開發時間 | 8 週 | 1 週 | **2-3 週** |
| 上線阻塞 | 律師 + bootstrap | 0 | **0** |

→ **本 plan 寫的 schema / code 將來 V0.5 商業化時 100% 沿用,差別只是 row 上的 flag**(custody_mode、perf_fee_bps)。詳見 § Unified Architecture。

---

## 🧩 Unified Architecture(Friends + Future Commercial 共用)

**原則**:Friends 跟 Commercial V0.5 的差別只有 3 個 axis,用 flag 表達,**底層共用 schema + code**:

| Axis | Friends mode | Commercial V0.5 mode |
|---|---|---|
| `custody_mode` | `"self"`(朋友自己保管) | `"platform"`(Quiver 持有 platform float) |
| `perf_fee_bps` | `0` | `1500`(15%) |
| `can_quiver_operate` | `false`(預設,F-Phase 3 改 true) | `true`(自動 rebalance) |

→ 同一份 `earn_accounts` 表、同一個 `BitfinexAdapter`、同一個 `/admin/earn` dashboard,**根據 flag 表現出不同行為**。

### Migration story(從 Friends → Commercial)

**現在(Friends)**:
```sql
INSERT INTO earn_accounts (user_id, custody_mode, perf_fee_bps, can_quiver_operate)
VALUES (alice_id, 'self', 0, false);
INSERT INTO earn_bitfinex_connections (earn_account_id, encrypted_api_key, is_platform_key, ...)
VALUES (alice_account_id, <Alice 自己的 key>, false, ...);
```

**律師 OK 後上線 V0.5(同時 onboard 公開用戶 Charlie)**:
```sql
-- Alice 不變(grandfathered as friend)
-- Charlie 新註冊
INSERT INTO earn_accounts (user_id, custody_mode, perf_fee_bps, can_quiver_operate)
VALUES (charlie_id, 'platform', 1500, true);
INSERT INTO earn_bitfinex_connections (earn_account_id, is_platform_key, ...)
VALUES (charlie_account_id, true, ...);  -- 用 platform 共用 key
```

→ **0 schema migration、0 code rewrite**,只是新 row 不同 flag。

---

## 核心架構(關鍵差異:**沒有共用資金池**)

```
Tommy(super admin,寫程式跟主操作)
  │
  └─ Quiver admin dashboard
       │
       ├─ 自己:
       │     Tommy Bitfinex API key  →  Tommy Bitfinex 帳戶
       │     Tommy Polygon address   →  Tommy MetaMask / 硬體錢包
       │     Tommy Tron address      →  Tommy 既有 wallet
       │
       ├─ Alice:
       │     Alice Bitfinex API key (read-only) → Alice 自己的 Bitfinex 帳戶
       │     Alice Polygon address              → Alice 自己 wallet(public read 即可)
       │
       ├─ Bob:
       │     Bob Bitfinex API key (read-only) → Bob 自己的 Bitfinex 帳戶
       │     Bob Polygon address              → Bob 自己 wallet
       │
       └─ ... (max 5-10 人)
```

**關鍵 invariants(這些不能破才不踩法律紅線)**:

1. **每個朋友的 USDT 永遠在自己的帳戶**
   - Quiver **不持有**任何朋友的資金
   - Quiver **不能 withdraw**(API key 不開 withdraw 權限)

2. **Quiver 不收任何費用**
   - 沒有 perf fee、沒有 management fee、沒有 platform fee
   - 朋友可以自願請你吃飯(這是友誼,不是金融服務)

3. **朋友自己決定要不要採取行動**
   - Quiver 可以**建議**「現在 AAVE 比 Bitfinex 高 1%,要不要轉?」
   - 但**不替朋友執行**(除非朋友明確授權,且必須 opt-in)

4. **Quiver 是工具不是顧問**
   - 朋友看到的是**數據**(他們自己的部位、APY 比較),不是「投資建議」
   - 加註「過往表現不代表未來」「DeFi 有 smart contract 風險」

---

## 法律自我評估(非律師意見)

| 議題 | 結論 | 為什麼 |
|---|---|---|
| 銀行法 § 29(非銀不得收受存款) | ✅ 不適用 | 沒收受任何人的款項,Quiver 從頭到尾沒控制朋友的錢 |
| 投信投顧法 § 16 | ✅ 不適用 | 沒「為他人管理資產」,朋友自己管自己的 |
| 集合資金管理 | ✅ 不適用 | 沒混合資金 |
| 投資顧問執照 | ✅ 不適用 | 沒收費 + 沒個別建議,只是 dashboard 顯示市場數據 |
| 個資法 | ⚠️ 適用 | 朋友的 API key + 部位是個資,需妥善加密儲存 |
| 友誼條款 | 🤝 適用 | 朋友要簽「我的錢我自己負責」非正式 acknowledgment |

→ **基本上沒法律風險**,只要嚴守 4 個 invariants。

> 但若日後想轉商業(收費 / 開放陌生人),**之前的工具可以延用,但會立刻進入律師會面流程**。

---

## 三階段漸進式實作

### F-Phase 1:Read-Only Multi-Account Dashboard(1.5 週)

> **MVP 階段。完成這個就有實用價值**:看到自己 + 朋友所有部位、APY 比較。

#### 工作內容

| Day | 任務 |
|---|---|
| F1-D1 | DB schema:`users.earn_tier` + `earn_accounts` / `earn_bitfinex_connections` / `earn_evm_addresses` / `earn_position_snapshots` + alembic migration |
| F1-D2 | Admin UI 新增 earn_account flow(輸入 Bitfinex API key + EVM address + Tron address,選 tier='friend')|
| F1-D3 | 抽象化 BitfinexAdapter 支援 multi-connection(從 PoC #2 重構,key 從 `earn_bitfinex_connections` 讀;同一份 code 將來也支援 platform 共用 key) |
| F1-D4 | 每日 cron 同步:每個 active `earn_account` 跑一次部位讀取,寫 `earn_position_snapshots` |
| F1-D5 | Admin dashboard `/admin/earn`:list 所有 earn_accounts,每個一張卡 + 總計卡 |
| F1-D6 | 跨 account APY 比較 table:當下哪個策略最有利、誰沒部署到最佳處 |
| F1-D7 | 文件 + onboarding script(朋友怎麼開 read-only API key 的 step-by-step)|

#### 資料 schema(Unified — Friends + Future Commercial 共用)

```sql
-- 既有 users 表加 earn 參與 tier
ALTER TABLE users ADD COLUMN earn_tier VARCHAR(16) NOT NULL DEFAULT 'none';
-- "none" = 沒參與 Earn(預設,既有 wallet 用戶)
-- "internal" = Tommy 自己 / admin
-- "friend" = friends-only(self-custody, no fee)
-- "commercial" = V0.5 公開用戶(platform-custody, 15% fee)— Phase 1 不會有 row

-- Earn 帳戶 metadata(統一給 Friends + Commercial 用)
CREATE TABLE earn_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,

    -- 核心 mode flags(這 3 個 axis 區分 friend / commercial)
    custody_mode VARCHAR(16) NOT NULL,           -- "self" / "platform"
    perf_fee_bps INTEGER NOT NULL DEFAULT 0,     -- 0 = friends, 1500 = V0.5
    can_quiver_operate BOOLEAN NOT NULL DEFAULT FALSE,  -- F-Phase 3 / V0.5 才 true

    -- onboarding metadata
    onboarded_by INTEGER REFERENCES users(id),    -- friend 模式由 admin 加
    risk_acknowledged_at TIMESTAMPTZ,             -- 朋友 / 用戶簽免責的時間

    notes TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bitfinex API key 連線(統一 Friends + Commercial)
CREATE TABLE earn_bitfinex_connections (
    id SERIAL PRIMARY KEY,
    earn_account_id INTEGER NOT NULL REFERENCES earn_accounts(id),

    is_platform_key BOOLEAN NOT NULL DEFAULT FALSE,
    -- True  = 用 Quiver platform 共用 key(Commercial mode,Phase 1 都是 false)
    -- False = 用此朋友 / 用戶自己的 key

    encrypted_api_key BYTEA,                      -- nullable: is_platform_key=True 時不存
    encrypted_api_secret BYTEA,
    key_version INTEGER,                          -- 接既有 KEK rotation
    permissions VARCHAR(32) NOT NULL,             -- "read" / "read+funding-write"

    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_bitfinex_conn_active
    ON earn_bitfinex_connections(earn_account_id) WHERE revoked_at IS NULL;

-- EVM 地址(self-custody 朋友自己 wallet,platform 模式指 Quiver EVM HOT)
CREATE TABLE earn_evm_addresses (
    id SERIAL PRIMARY KEY,
    earn_account_id INTEGER NOT NULL REFERENCES earn_accounts(id),
    chain VARCHAR(32) NOT NULL,                   -- "polygon" / "ethereum"
    address VARCHAR(64) NOT NULL,
    is_platform_address BOOLEAN NOT NULL DEFAULT FALSE,  -- platform 模式 = True
    label VARCHAR(64),                            -- "Alice MetaMask" / "Alice Ledger"
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每日部位快照(用於追蹤 APY trend,Friends + Commercial 共用)
CREATE TABLE earn_position_snapshots (
    id SERIAL PRIMARY KEY,
    earn_account_id INTEGER NOT NULL REFERENCES earn_accounts(id),
    snapshot_date DATE NOT NULL,
    bitfinex_funding_usdt NUMERIC(38, 18),        -- 在 Bitfinex Funding wallet
    bitfinex_lent_usdt NUMERIC(38, 18),           -- 已借出去
    bitfinex_daily_earned NUMERIC(38, 18),        -- 當日結算
    aave_polygon_usdt NUMERIC(38, 18),            -- AAVE supply 部位(USDT 換算)
    aave_daily_apr NUMERIC(8, 6),                 -- 當日 APR snapshot
    total_usdt NUMERIC(38, 18),
    UNIQUE (earn_account_id, snapshot_date)
);
```

> 💡 **跟原 friend_* 設計的差別**:
> - 不另開 `friend_accounts` 表,而是 `users.earn_tier` + `earn_accounts`
> - `earn_bitfinex_connections.is_platform_key` flag 讓未來 commercial mode 自動接上
> - `earn_evm_addresses.is_platform_address` 同上
> - 所有部位 / earnings 都掛 `earn_account_id`,Friends 跟 Commercial 用同一張表
> - **未來 V0.5 上線:0 schema migration、0 code rewrite,只是新 row 帶不同 flag**

#### 朋友 onboarding flow(給朋友的步驟)

`docs/earn-friends-onboarding.md` 內容範本:

> 1. 在 Bitfinex 開 API key,**只開以下權限**:
>    - ✅ Account History — Get historical entries
>    - ✅ Margin Funding — Get funding statuses
>    - ✅ Wallets — Get balances
>    - ❌ **不要開**任何 write 權限
>    - ❌ **不要開** Withdrawals
> 2. 加 IP whitelist 是 Quiver server 的 IP(我會給你)
> 3. 把 API key + secret 給 Tommy(用 Signal / 加密 channel,不要 Email)
> 4. 你的 Polygon 地址(MetaMask 用的那個)貼給 Tommy
> 5. 你的 Tron 地址(可選,用來統計總部位)貼給 Tommy
> 6. 你的部位永遠在你帳戶,Quiver 只讀資訊,**沒有任何權限動你的錢**
> 7. 隨時可以在 Bitfinex 撤銷 API key(我也會教你怎麼做)

---

### F-Phase 2:Friend Self-Service Login(1 週,選做)

> 等 Phase 1 跑了一陣子、朋友想要自己看 dashboard 時做。

#### 工作內容

| Day | 任務 |
|---|---|
| F2-D1 | 朋友用既有 Google OAuth 登入,但角色 = "friend"(新角色)|
| F2-D2 | `/earn` 用戶頁,顯示**只屬於這個朋友的部位**(by `earn_account_id` 過濾,= 自己的 user_id)|
| F2-D3 | 月報 email(寄給 friend.email,內含 30 天 APY trend、累計 earnings)|
| F2-D4 | 朋友可以撤銷 API key 授權(從 Quiver UI,觸發 `earn_bitfinex_connections.revoked_at`)|
| F2-D5 | 「免責 acknowledgment」popup:第一次登入要 click 「我了解這是非正式工具,我的錢我自己負責」 |

---

### F-Phase 3:Tommy 替朋友執行(1.5 週,進階)

> 朋友信任度高、希望 Tommy 幫忙做 Bitfinex auto-renew 時做。**這個階段法律 status 仍在綠色帶**(沒收費、沒混合),但要謹慎操作。

#### 工作內容

| Day | 任務 |
|---|---|
| F3-D1 | 升級 `earn_bitfinex_connections.permissions` 支援 `read+funding-write`(各 friend 自己決定要不要給)+ 在該朋友 `earn_accounts.can_quiver_operate=true` |
| F3-D2 | 「Auto-renew Bitfinex offer」cron,每天掃所有 friends,如有 idle 就 submit FRR offer |
| F3-D3 | 「APY 落差告警」:當某 friend 的 AAVE > Bitfinex 1% 以上,Email 通知該 friend(by email) |
| F3-D4 | 「跨 friend rebalance suggestion」:Tommy 看到 dashboard 知道誰需要動作,可一鍵發 email 給朋友 |
| F3-D5 | 操作 audit log:每次 Tommy 替朋友動作都寫紀錄(誰、何時、做了什麼) |

> ⚠️ **Phase 3 法律邊界**:當 Tommy 主動執行(submit offer)而非朋友自己執行,法律可能會被解讀為「為他人管理」。即使沒收費,**人數一旦超過 ~5 人**就該諮詢律師。建議:
> - Phase 3 限 5 人以下
> - 每筆操作有 friend 預先**書面**(Telegram / Email)同意
> - 朋友隨時可撤銷,撤銷立刻失效

---

## 安全考量(critical)

### Bitfinex API key 加密

- 用既有 Quiver KEK(跟 user wallet priv key 同一個 system)
- AES-GCM
- key_version 接到 rotation
- DB column 是 BYTEA 不是 TEXT(避免被 log 印出來)

### Withdrawal 權限永遠不開

- Quiver **絕對不要**處理朋友 Bitfinex 的 withdrawal 權限
- 即使 Phase 3,也只開 Funding offer/cancel,不開 withdrawal
- 這是法律 + 安全雙重防線

### IP whitelist

- 朋友的 API key 加 IP 限制是 Quiver server 的 IP
- 即使 leak,從外部 IP 也叫不動

### Tommy 自己的 Bitfinex 帳戶 2FA

- Tommy 的主帳戶要有 2FA(不只 API key)
- 因為 Tommy 帳戶被駭 = 整個系統被駭

### 朋友資料保密

- 朋友的部位資訊不能洩露
- 不要把 Quiver dashboard 截圖貼到公開地方
- 寫程式時不要 log 朋友的 USDT 餘額

---

## 商業敘事(萬一將來想轉商業)

如果 F-Phase 1 跑了 6 個月、累積 5+ 朋友、Tommy 觀察到 APY 真的可以穩定 5-7%,且有人問「我可以付錢請你管嗎?」,**那時才開始 V0.5 商業流程**:

1. 帶數據去找律師(實際 6 個月真實 APY、5 個朋友的滿意度)
2. 律師起草用戶協議
3. 補上 perf fee 機制
4. 開放 onboarding 給陌生人
5. **Friends tooling 程式碼可以延用**(差別只在用戶來源 + 計費邏輯)

→ 這個是 **dual-track strategy**:現在 friends-only,跑出數據,將來律師 OK 了無縫升級。

---

## 立即可做的 4 個 action items

### 這週可做

1. ✅ **F1-D1 + D2**:寫 alembic migration + admin UI 加朋友功能(2 天)
2. ✅ **F1-D3 + D4**:重構 BitfinexAdapter + 每日 cron(2 天)
3. ✅ **F1-D5**:Admin dashboard `/admin/friends-earn`(1 天)
4. ✅ **F1-D6 + D7**:APY 比較 + 朋友 onboarding 文件(1 天)

→ **5-7 個工作日**(1-1.5 週)Phase 1 完成。

### 這個月可做

- F-Phase 1 完成後跑 2 週純自己,確認沒 bug
- 邀請 1-2 個朋友(關係夠近的)當 alpha tester
- 如果順,再開 5 人 beta

### 3 個月後決策點

- 如果 APY 真的不錯 + 朋友有興趣 → 評估是否進 Phase 2 (friend login)
- 如果 APY 平淡 → 收一收,當作試水溫
- 如果朋友想付錢 → 才進 V0.5 律師會面

---

## 預算

| 項目 | 估算 |
|---|---|
| 律師費 | **$0**(不需要) |
| 你個人 Bitfinex 測試金 | $500-1000(自己賺,不算成本) |
| 朋友自己的測試金 | 朋友各自負責 |
| Quiver server infra | $0 增量(既有的就夠) |
| dev time | 1-1.5 週 |

→ **整個 plan 真實成本接近 0**(除了你的時間)。

---

## 跟 V0.5 plan 的關係(unified architecture 版)

### Schema / Code 100% 共用

| 項目 | Friends 用法 | V0.5 用法 |
|---|---|---|
| `users.earn_tier` | `'friend'` | `'commercial'` |
| `earn_accounts.custody_mode` | `'self'` | `'platform'` |
| `earn_accounts.perf_fee_bps` | `0` | `1500` |
| `earn_accounts.can_quiver_operate` | `false`(F-Phase 1)/ `true`(F-Phase 3) | `true` |
| `earn_bitfinex_connections.is_platform_key` | `false`(朋友自己的 key) | `true`(共用 platform key) |
| `earn_evm_addresses.is_platform_address` | `false`(朋友自己 wallet) | `true`(Quiver EVM HOT) |
| `earn_position_snapshots` | 朋友帳戶讀回的真實餘額 | platform float 算 share 的虛擬部位 |
| `BitfinexAdapter` | 同一份 code,根據 `is_platform_key` 切 key | 同上 |
| `/admin/earn` | 列所有 friend rows | 列所有 commercial rows(+ friends) |

### V0.5 額外要做的事(完全不影響 Friends 部分)

| 新增功能 | 工時 | 觸不觸碰 Friends? |
|---|---|---|
| Quiver platform Bitfinex 帳戶 + key | 0.5 day | 不(新增 platform `is_platform_key=true` row) |
| Quiver platform EVM HOT(spec W2-D1) | 1 day | 不 |
| 用戶自助 signup → 進 commercial mode | 1 day | 不 |
| 用戶 deposit / withdraw to Earn 流程 | 2-3 day | 不(Tron HOT 內部記帳,既有架構) |
| Bridge automation(spec W3) | 5 day | 不 |
| Auto-rebalance(spec W5) | 5 day | 不 |
| 15% perf fee 計算 + 結算 | 1 day | 不 |
| Risk disclosure UX | 2 day | 不 |

→ **V0.5 開發 = 在 unified schema 上補 platform 端 + 用戶 UX**,**Friends code 完全沒動**。

### Future-proof 程度自我檢查

- [x] Friends 跟 Commercial 用同一個 `earn_accounts` 表
- [x] 同一個 BitfinexAdapter,key source 用 flag 區分
- [x] 同一個 dashboard,UI 根據 tier 顯示不同細節
- [x] Friends row 不需 schema migration 即可繼續存活
- [x] 新 commercial 用戶就是新 row,沒「轉移」概念
- [x] Friends 中的某個朋友若**主動申請**轉 commercial(付費版),只是 UPDATE 那 row 的 `custody_mode` + `perf_fee_bps` + 把 platform key 接上

---

## 未決的小決策(寫程式前要拍板)

1. **朋友需先有 Quiver wallet 帳戶嗎**(因為 `earn_accounts.user_id` FK 到 `users`)?
   - 我的建議:**是**,朋友先用 Google OAuth 登入 Quiver,然後 Tommy elevate `earn_tier='friend'`。好處:他們順便試用 Quiver wallet、未來自助登入看 dashboard 也用同一帳號。
2. **多少朋友算上限**:5 / 10 / 不設限?
   - 我的建議:**Phase 1 max 5 人**,跑順了再開到 10
3. **Tommy 自己怎麼設**:
   - 我的建議:**`users.earn_tier='internal'`**(跟 friend 區分,將來商業化也不會混到 friend 統計)
4. **要不要做月報 email**:
   - 我的建議:Phase 2 做(Phase 1 admin 自己看就好)
5. **APY 落差告警閾值**:多少 % 差距才告警?
   - 我的建議:**1%**(再低 noise 太多)
6. **`earn_account` 是否強制只能一個 user 一個**(`UNIQUE (user_id)`)?
   - 我的建議:**是**,簡化邏輯。一個朋友想要 self-custody 的同時加 platform 部位是 V0.5+ 的 feature,先不支援。

---

_Last updated: 2026-05-01_
