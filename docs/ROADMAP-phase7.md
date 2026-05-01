# Quiver Roadmap — Phase 6E 起

> Phase 1 ~ 6D 已完成(完整 onboarding → 入金 → 內轉 → 提領 happy path 通)。
> 本文件規劃**上線前必備**(Phase 6E)+ **Mobile App**(Phase 7)+ **營運強化**(Phase 8)+ **Quiver Earn V0.5**(Phase 9)+ **加分項 backlog**。

---

## Phase 6E — Production Hardening(上線前必備)

> 真錢上線之前必做。建議按子 phase 順序進行,每完成一個都可獨立驗收。

### 6E-1 — OAuth 帳號完整化 ✅(已完成,commit `91d4e3a`)

> 原訂規劃為「Email 驗證 + 密碼重設」,但本系統是 Google OAuth-only:
> - Email 已由 Google 驗證(callback 已檢查 `userinfo.email_verified`)
> - 沒密碼可重設
>
> 實際做的是更務實的「OAuth 友善」三件事:登入裝置管理、個資匯出、帳號刪除流程。

實作內容:

- **登入裝置管理**
  - schema:`login_sessions` (user_id, jti, ip, user_agent, created_at, last_seen_at, revoked_at)
  - JWT 帶 `jti` claim,中介層每 request 驗證 session 沒被 revoke
  - `last_seen_at` 限流(每分鐘最多寫一次,避免熱 row)
  - `POST /api/auth/logout` 改成會 revoke 當前 session
  - `GET /api/me/sessions` 列出最近 50 個 session
  - `POST /api/me/sessions/revoke-others` 登出除當前外所有裝置
- **個資匯出**(個資法第 10 條 / GDPR right to access)
  - `GET /api/me/export` 回 JSON download
  - 含 profile + KYC metadata + ledger entries + withdrawals
  - 不含 KYC 照片本體(避免檔案過大,需聯絡客服)
- **帳號刪除**(個資法第 11 條 / GDPR right to erasure)
  - schema:`users.deletion_requested_at`、`users.deletion_completed_at`
  - 用戶端:`POST/DELETE/GET /api/me/deletion-request`
  - admin 端:`GET /api/admin/deletion-requests`、`POST .../{user_id}/complete`
  - **餘額必須 = 0** 才能完成(避免用戶失去資產)
  - **soft delete**(法遵需要保留交易紀錄):status → SUSPENDED、email → `deleted-{id}@quiver.deleted`、display_name + avatar 清除、所有 sessions revoke、ledger entries 保留
- **前端**
  - `/settings` 頁面:登入裝置卡 + 帳號管理卡(匯出 + 刪除)
  - `/admin/deletion-requests` 頁面:列出申請、餘額檢查、完成按鈕
  - app header 加齒輪 icon、Dashboard admin card 加「刪除申請」入口
  - i18n zh-TW + en

驗收(已通過):
- 登出再登入後 settings 看到 1 個 session 標「此裝置」
- 開無痕另登一次 → 看到 2 個 session → 「登出所有其他裝置」→ 無痕被踢出
- 「下載 JSON」拿到 export 檔(profile + KYC + ledger + withdrawals)
- 申請刪除 → admin 列表看到 + 餘額 ≠ 0 被擋 → 取消 / 完成 都通

---

### 6E-2 — 提領安全 ✅(已完成,commit `52aa229`)

實作內容:
- **2FA TOTP**(`pyotp` + envelope encryption)
  - schema:`users.totp_secret_enc` / `totp_key_version` / `totp_enabled_at` + `totp_backup_codes` 表(只存 sha256 hash + used_at)
  - `/api/me/2fa` GET / setup / enable / disable(rate-limited 10/5min)
  - 啟用後產 8 組一次性 backup codes,disable 時驗 TOTP 或 backup code 都通
  - frontend `/settings/security` TwoFACard:QR(qrcode.react)+ 啟用 + backup codes 一次性顯示後消失
  - dev / prod 區分:`Quiver (Dev): {email}` vs `Quiver: {email}` 顯示在 Authenticator app
- **提領白名單地址**
  - schema:`withdrawal_whitelist`(user_id, address, label, activated_at, removed_at)
  - 加地址 → 24hr 冷靜期(`whitelist_cooldown_hours` 可調)
  - `users.withdrawal_whitelist_only` toggle 開啟後,提領只能到 active 白名單
  - 切換模式時 admin 有開 2FA 必驗 totp_code
- **提領頻率上限**
  - settings:`withdrawal_daily_count_limit=3`、`withdrawal_daily_amount_limit_usd=5000`(可調)
  - 過去 24h `count >= limit OR sum+amount > limit` → 自動 `PENDING_REVIEW`
  - 提領 submit 完整守則:**TOS → KYC → 2FA → whitelist-only → velocity → FEE_PAYER 健康 → 餘額**
- **提領完成訊息精準化**:`review_reason` 欄位(LARGE_AMOUNT / VELOCITY_COUNT / VELOCITY_AMOUNT)讓前端顯示正確訊息,不再「金額較大」誤導
- **內部轉帳也套上 2FA**(commit `ea19dbb`):`execute_transfer` 同樣會驗 totp_code
- **平台獲利提領**(commit `e282e32`)— 順便把 `app/services/platform_outbound.py` 抽出來成通用「平台 outbound」service,reusable for 6E-4
  - 強制 admin 必須 2FA(`TwoFAAdminDep`,commit `b28e562`,412 admin.twofaRequired)
  - amount ≤ platform_profit(race-safe quota,扣 in-flight 提領金額,commit `9b7541c`)
  - audit log `platform.fee_withdraw`

驗收(已通過):
- 2FA setup → enable → 8 組 backup codes → 提領 / 轉帳必驗 TOTP
- 白名單 24hr cooldown 才 active、only mode 擋未啟用地址
- 第 4 筆提領自動 PENDING_REVIEW 並回 `VELOCITY_COUNT` reason
- admin 沒開 2FA → 平台獲利提領 412

---

### 6E-3 — 平台資安基本盤 ✅(已完成,commit `b05726e`)

實作內容:
- **Audit log**:`audit_logs` 表(append-only)+ `app.services.audit.write_audit()` helper
  - 接到 14 個動作:KYC approve/reject、提領 approve/reject/force-fail、bulk-sweep、sync-tatum、replay-onchain-tx、reconcile、complete-deletion、deletion request/cancel、revoke-others、login-success
  - `GET /api/admin/audit` 可依 actor / action / target / 分頁 filter
  - `/admin/audit` 頁面 + Dashboard admin card 連結
- **Rate limit**:Redis token-bucket 中介層(redis 掛了 fail-open)
  - `/api/auth/google/login` 10/min
  - `/api/withdrawals` submit 10/5min
  - 超過回 429 + `Retry-After` header
- **Sentry**:`sentry-sdk[fastapi]` + `app.core.sentry.init_sentry()` (DSN 空字串 no-op)
  - 接到 api lifespan + arq worker startup
  - env / release / traces sample rate 全從 settings

驗收(已通過):
- Audit 寫入 + 查詢 + 篩選都通
- 第 11 次 login 回 429 + Retry-After: 60
- 無 DSN 時 boot 乾淨

---

### 6E-4 — 冷熱錢包架構 ✅(已完成,commit `47bd767`)

> 重要修正:原本 ROADMAP 寫「派生 COLD wallet (m/44'/195'/3'/0/0)」其實邏輯上有矛盾 —
> 從 master seed 派生的話私鑰仍在系統內,失去「冷」的意義。改設計為**地址外包**:
> 系統只記住地址,私鑰永遠在運營者手上(TronLink / 硬體錢包 / 多簽 / 紙錢包)。

實作內容:
- **Settings**(`.env`):`COLD_WALLET_ADDRESS`、`HOT_MAX_USDT` (5000)、`HOT_TARGET_USDT` (2000)
- **`compute_quota` 加 COLD 維度**:
  - `cold_balance`:從 Tatum 即時讀 COLD 鏈上 USDT
  - `cold_rebalance_max = min(HOT - HOT_TARGET, profit)`(雙重保險:不能動到用戶資金)
  - `total_holdings = (HOT - in_flight) + COLD`
- **Endpoints**:
  - `GET /api/admin/platform/cold-wallet` — 地址 + 餘額 + over_max + over_max_amount
  - `POST /api/admin/platform/cold-rebalance` — `TwoFAAdminDep` 守則 + 走 `send_platform_outbound` (purpose=COLD_REBALANCE)
  - audit log `platform.cold_rebalance`
- **Frontend `/admin/platform`**:藍色 COLD card(雪花 icon)— 顯示地址 / 餘額 / 上限 / over_max 警示 / 「移轉到 COLD」按鈕
  - modal 4 種狀態:未設定 COLD / 沒開 2FA / 無可移額度 / 可送出
  - 預設建議金額 = `min(HOT - HOT_TARGET, cold_rebalance_max)`
- **`platform_insolvent` 修正**:從 `HOT < user_ledger` 改成 `total_holdings < user_ledger`,讓 admin 把錢移到 COLD 後不會誤報 insolvency
- **`overview` KPI**:加 `cold_address` / `cold_usdt_balance` / `total_holdings` / `hot_over_max`

驗收(已通過):
- 設定 COLD_WALLET_ADDRESS=TronLink → quota 即時讀到 COLD 餘額 3230 USDT
- HOT 868 > MAX 100 → over_max=true、over_max_amount=768
- profit=0 時 cold_rebalance_max=0,modal 顯示「目前無可移額度」說明

未做的部分(可以加入後續優化):
- cron 自動偵測 HOT 超過 MAX → email / push admin(目前只在 admin UI 顯示警示)
- 用「平台 deposit COLD ledger」精準追蹤(避免混用 COLD 個人原有餘額時 total_holdings 失準)
- 提領前 HOT 不夠時的 admin 補資流程(現在只會擋住新提領,沒有自動 cross-wallet 補資)

---

### 6E-5 — 上線 checklist ✅(已完成,commit `3797ffa`)

實作內容(code + config):
- **Cron heartbeat**:`hb:cron:*` Redis key,sweep_all + reconcile cron 跑完寫,watchdog cron 每 10 分鐘掃 stale → Sentry alert
- **TOS / Privacy gating**:`users.tos_accepted_at` + `tos_version` schema(既有用戶 backfill `pre-tos`)、`/api/me/tos` GET+POST、`TosAcceptedUserDep` 加在 KYC/transfer/withdrawal endpoint、frontend `TosGate` modal
- **Legal pages**:`/legal/terms` + `/legal/privacy` 範本(已填入目前手續費 / 大額閾值 / 法定保留年限,佔位符標註待律師 review)
- **Postgres slow query log**:`log_min_duration_statement=500` (≥ 500ms 的查詢寫到 docker logs)
- **Next.js bundle analyzer**:`npm run analyze` (`@next/bundle-analyzer`)
- **DB backup**:`infra/backup/{Dockerfile,pg_dump.sh,restore.sh}` (S3 SSE-KMS)

Runbooks:
- `docs/runbook-bootstrap.md` — KEK 產生 + Shamir 3-of-5 + 第一次 deploy
- `docs/runbook-mainnet-cutover.md` — testnet → mainnet 切換 + 5 USDT sanity test
- `docs/runbook-backup-restore.md` — 每日備份 + 每週 restore drill
- `docs/runbook-launch-day.md` — T-7 → T+5 階段性 checklist

Config:
- `.env.production.example` 完整範本(Sentry DSN、S3 backup、強密碼提醒、mainnet keys)

驗收(已通過):
- TOS modal 用戶第一次登入會跳、勾同意後不再跳
- TOS 沒同意過的提領被擋(403 `tos.notAccepted`)
- cron heartbeat 寫到 redis、watchdog 跑出 `stale:0`
- postgres `SHOW log_min_duration_statement` = 500ms

**剩下未做的部分**(都需要 user 行動,不是 code):
- 真實 master seed 產生(必須在 production 機器上跑)
- 真 KEK 拆 Shamir 並分發
- 換 mainnet Tatum key
- 設真實 SENTRY_DSN
- 設真實 S3 bucket + KMS key
- 找律師 review TOS / Privacy 內容

---

## Phase 7 — Mobile App(Flutter)

> Backend API 都已就緒,Flutter 只是 thin client。

### 7A — 基礎(預估 1 週)
- Flutter 專案初始化(`apps/mobile`)
- OpenAPI → Dart client 自動生成(`openapi-generator`)
- 共用 i18n key(`infra/i18n/`)
- Auth:Google Sign-In(SSO)→ exchange JWT
- Dashboard:餘額卡 + 最近活動 + 收款 QR
- Theme:Macaron 配色 + 深色模式

### 7B — 核心功能(預估 1 週)
- KYC 流程(用相機拍身分證 + 自拍,壓縮上傳)
- 內部轉帳(輸入 email or 掃 QR)
- 提領(掃 Tron 地址 QR + 2FA)
- 通知中心 + FCM 推播

### 7C — 體驗強化(預估半週)
- Face ID / 指紋解鎖(`local_auth`)
- 入金 push(收到 deposit POSTED 立即推播)
- 應用內 in-app review prompt(完成第一筆轉帳後)

### 7D — 上架(預估半週)
- iOS:TestFlight → App Store Connect → 審核
- Android:Internal Testing → Closed Testing → Production
- 各國 store listing(zh-TW / en)

**Phase 7 驗收**:TestFlight 與 Play Internal 都能裝、可完成 KYC + 轉帳 + 提領、推播正常。

---

## Phase 8 — Operational Excellence(上線後)

> 上線後 1-3 個月內逐步加。

### 8A — 用戶體驗
- 月對帳單 PDF + CSV 匯出(寄信)
- 用戶個人資料編輯(顯示名稱、頭像、預設語言)
- 入金 / 提領 / 轉帳 filter + 日期區間 search
- 大額提領滑動驗證 + 二次確認 modal

### 8B — Admin 工具
- 手動凍結 / 解凍用戶(寫 audit log)
- 平台收益報表(每日 / 每月 fee 累計 + 圖表)
- 用戶細項頁(餘額歷史、所有 KYC 紀錄、登入紀錄)
- KYC 二級審核(suspicious activity → 升級驗證)

### 8C — 法遵
- AML transaction monitoring(規則:單日多筆相同金額、地址命中黑名單、地址首次提領大額)
- SAR(Suspicious Activity Report)後台流程
- KYC 等級制度(Lv1 < $X、Lv2 < $Y、Lv3 機構)
- 台灣海外所得稅務報表協助(每年 3 月)

### 8D — 規模化
- DB 讀寫分離(讀 replica)
- API 加 caching(rates / hot-wallet info,Redis 30s TTL)
- 推播多通路(email + in-app + FCM,可選)
- WebSocket 取代 polling(balance card / notifications)

---

## Phase 9 — Quiver Earn V0.5(Bitfinex Funding 70% + AAVE V3 30%)

> **Status**: 已完成完整 PoC(Phase 3 #1-#3),技術阻塞 0。**律師會面為唯一阻塞**。
> **Companion docs**:
> - `docs/QUIVER-EARN-PROPOSAL.md` — 整體商業 / 法律敘事
> - `docs/EARN-POC-REPORT.md` — Phase 1-3 PoC 結果(JustLend / mock / scanner / AAVE / Bitfinex / bridge)
> - `docs/EARN-V05-BITFINEX-AAVE-PLAN.md` — V0.5 整體 8 週計畫
> - `docs/EARN-V05-DEV-SPEC-W1-W2.md` — W1+W2 ticket 級開發 spec
> - `docs/EARN-V2-MULTIPROTOCOL-PLAN.md` — V1 4-DeFi 替代方案(若律師擋 V0.5)

### 9-Pre — 律師意見書(必須先完成)

> **這是唯一阻塞**。技術已驗證,沒做這件事不能進開發。

需要律師回答的核心問題(從 25 個篩到 8 個關鍵):
1. Bitfinex Funding **不是「給 CEX 存款」**(借給 margin trader,Bitfinex 是中介),這個論述在台灣銀行法 § 29 下成立嗎?
2. Quiver 在 EVM HOT 上維護 platform float,代表用戶部位在 AAVE,這算不算「集合資金管理 / 投信投顧法 § 16 適用」?
3. 收 15% 績效手續費,法律上是「成功報酬」還是「投資建議費」?稅務歸類?
4. Auto-rebalance(每日掃描自動換 strategy)是否觸發投資顧問執照?
5. 多鏈 7×24 監控義務,Quiver 是「資產管理者」還是「軟體服務商」?
6. 如果 Bitfinex / AAVE 出事造成損失,Quiver 對用戶賠付責任的法律邊界?
7. 用戶協議要寫到什麼程度才算「充分風險揭露」?具體文字律師能給範本嗎?
8. V0.5 違法 / 灰色?如果結論灰色,V0(只做 AAVE、不做 Bitfinex、不 auto-rebalance)能否?

**輸出**:律師意見書 + V0.5 用戶協議草稿 + 風險揭露文字。
**預估**:1.5 hr 諮詢 + 1-2 週律師起草 + 1 週 review。
**費用**:NT$30K-100K(視律師等級)。

### 9-W0 — 律師綠燈後第一天

> 細節見 `EARN-V05-DEV-SPEC-W1-W2.md` § W0。

- W0-T1:`YieldStrategy` ABC 升級(取代既有 `YieldProtocol`,backwards compat)
- W0-T2:Alembic migration:`earn_strategy_positions` / `earn_bitfinex_offers` / `earn_bitfinex_earnings` / `platform_evm_wallets`

預估: 半天

### 9-W1 — Bitfinex Funding Strategy(5 工作日)

| Day | 任務 | 細節文件 |
|---|---|---|
| W1-D1 | 重構 PoC 為 production adapter(async + retry + nonce monotonic + sig test) | spec § W1-D1 |
| W1-D2 | get_health / get_position(read-only) | spec § W1-D2 |
| W1-D3 | submit_offer / cancel_offer / Exchange↔Funding wallet transfer(write,要先升 API key 權限) | spec § W1-D3 |
| W1-D4 | BitfinexRepo + 整合 EarnService + cron(daily earnings sync) | spec § W1-D4 |
| W1-D5 | Admin UI `/admin/earn` Bitfinex 卡 + runbook | spec § W1-D5 |

**驗收**:admin 可以從 web UI 看 Bitfinex 部位、手動 deploy/cancel(2FA)、daily earnings 自動同步。

### 9-W2 — AAVE V3 Polygon Strategy(5 工作日)

| Day | 任務 | 細節文件 |
|---|---|---|
| W2-D1 | Platform EVM HOT wallet 機制(EOA + KEK 加密) | spec § W2-D1 |
| W2-D2 | AAVE V3 read methods(supply rate / position) | spec § W2-D2 |
| W2-D3 | supply / withdraw 簽 tx(approve + supply + withdraw)+ Amoy testnet smoke | spec § W2-D3 |
| W2-D4 | Mainnet 真錢 smoke(~$5 USDT 走完全程) | spec § W2-D4 |
| W2-D5 | AaveRepo + StrategyManager 雛形 + Admin UI 加 AAVE 卡 | spec § W2-D5 |

**驗收**:admin 從 UI 手動 deploy 1 USDT 到 AAVE Polygon 成功、aToken 餘額正確、StrategyManager 列出兩個 strategy 健康。

### 9-W3 — Bridge 整合 + StrategyManager 完整版

- Symbiosis API adapter(Tron USDT → Polygon USDT)
- Binance withdraw 半自動 flow(API + admin trigger)
- BridgeManager 抽象,可切換 Symbiosis / Binance
- StrategyManager 完整版:Tron HOT → bridge → EVM HOT → AAVE 的端到端 deploy

### 9-W4 — Reconciliation + 4 鏈水位監控

- 每日對帳 cron:assert sum(user_virtual_positions) == Tron HOT + Bitfinex + Polygon EVM HOT + AAVE position
- Drift > 0.01% 觸發 admin alert
- Admin dashboard 4 鏈水位卡

### 9-W5 — Auto-Rebalance(可選)

- Daily cron 掃 APY,計算 payback,只在 < 14 天時搬
- 護欄:單次最多 30%、24h 內 1 次、APY 異常飆升自動 pause
- 跑 30 天歷史模擬資料 backtest,確認行為合理才上線

### 9-W6 — 用戶 UX:Earn deposit / withdraw

- `/earn` 用戶頁:餘額卡 + 30 天 net APY + 部位分布(Bitfinex 70% / AAVE 30%)
- `Deposit USDT to Earn` 流程:從 Quiver 主錢包餘額劃轉到 Earn(內部記帳)
- `Withdraw from Earn` 流程:逆向,扣 15% perf fee
- 風險揭露 onboarding:三屏明確告知(Bitfinex CEX 風險、DeFi smart contract 風險、不保證收益)

### 9-W7 — Mainnet 整合測試 + Beta soft launch

- 自己跑 1 週,觀察:Bitfinex 結算 / 利息累積 / AAVE position drift / reconciliation 0 漂移
- 招募 5-10 個 friends 帳戶 beta,各放 $50-500 USDT
- 緊急 kill switch:admin 一鍵把所有部位撤回 Tron HOT(需 2FA + 二次確認)

### 9-W8 — Beta 公開 + 用戶協議簽署 + 上線文宣

- 限額 beta 30 個用戶,每人 max $5K
- 用戶 onboarding 必須簽 V0.5 用戶協議(律師起草版本)
- 監控、alerting、runbook 完整

### Phase 9 驗收

- [ ] 律師意見書(必)
- [ ] 30 個 beta 用戶跑 30 天無 incident
- [ ] 自動 reconciliation 30 天 drift = 0
- [ ] 每月平均 net APY ≥ 4%
- [ ] 7×24 監控 + 緊急 kill switch 演練成功

### Phase 9 預算

| 項目 | 預估 |
|---|---|
| 律師意見書 + 用戶協議 | NT$30-100K |
| Bitfinex 測試金 + Polygon mainnet smoke | ~$20 USD |
| Alchemy 付費 RPC(若 dev 不夠用) | $0-50 / month |
| Nexus Mutual cover(可選) | ~1% × 部位 / 年 |
| dev time(8 週,單人) | (你自己時間) |

---

## Backlog — 加分項

> 不影響上線、想做再做。

- 🎁 推薦獎勵(邀請碼 + 雙方各得 1 USDT credit)
- 🪙 多幣種(USDC、USDT-ERC20、TUSD)
- 💱 站內換匯(USDT ↔ TWD,接 BitoPro / 第三方流動性)
- 🔔 自訂通知偏好(哪些事件要推 / 要 email / 都不要)
- 🏷 轉帳備註支援 emoji + tag
- 📊 用戶端理財儀表板(月支出趨勢、入帳分類)
- 🌐 多語言完整化(目前還有零星硬寫字串)
- ♿ a11y 全面 audit(WCAG AA)
- 🧪 測試覆蓋率 ≥ 80%(目前 ~50%)
- 📚 開發者文件(自架 docs site,介紹架構 + ADR)

---

## 建議實作順序(由投入產出比排)

| 優先 | 項目 | 預估 | 阻擋上線? | 狀態 |
|---|---|---|---|---|
| P0 | 6E-1 OAuth 帳號完整化(sessions + export + 刪除) | 2-3 hr | ✅ | ✅ 完成 |
| P0 | 6E-3 Audit log + Rate limiting + Sentry | 0.5 day | ✅ | ✅ 完成 |
| P0 | 6E-5 上線 checklist + Mainnet 配置 | 1 day | ✅ | ✅ 完成 |
| P1 | 6E-2 2FA + 白名單 + 頻率上限 + 平台獲利提領 | 0.5 day | 強烈建議 | ✅ 完成 |
| P1 | 6E-4 冷熱錢包架構 | 1 day | 強烈建議 | ✅ 完成 |
| P2 | **Phase 9 Earn V0.5 律師意見書** | 1.5 hr 諮詢 + 2 週律師起草 | ❌(獨立業務) | 🟡 阻塞中 |
| P2 | **Phase 9 Earn V0.5 W1+W2(Bitfinex + AAVE adapter)** | 2 週 | ❌ | ⏸ 等律師 |
| P2 | **Phase 9 Earn V0.5 W3-W8(bridge + rebalance + UX)** | 6 週 | ❌ | ⏸ 等律師 |
| P3 | Phase 7A-D Mobile App | 3-4 週 | ❌ | ⏸ |
| P3 | Phase 8 各子項 | 持續 | ❌ | ⏸ |

> **平行路徑建議**:
> - Earn V0.5 律師會面是時間瓶頸(實質拖 2-4 週),這段時間可同步推 **Mobile Phase 7**(後端已完備)
> - Earn V0.5 上線(律師 + 8 週開發)總計 **~10-14 週**,比 Mobile 慢
> - 兩條線並行可優化整體上線時程

**🎉 整個 Phase 6E 完成!**所有 P0 + P1 都清光,程式碼層面該做的上線準備都做完了。

**真正剩餘的工作**(都需要 user 行動,程式碼不能自動化):

| 項目 | 為什麼非你不可 | 何時 |
|---|---|---|
| Production master seed 產生 + Shamir 拆 KEK 5 份 | 私鑰必須在 production 機器產生,不交給任何工具 | bootstrap day |
| Tatum mainnet API key 申請 + 升 paid plan | 帳號實名 + 信用卡 | T-7 |
| Sentry / S3 + KMS 帳號 | 雲服務帳號設立 | T-7 |
| 律師 review TOS / Privacy 內容 | 法遵簽核 | T-7 |
| Google OAuth Production credential | OAuth consent screen 需 Google 驗證 | T-7 |
| DNS 設定(`api.quiver.io` 等) | 域名你買的 | T-3 |
| COLD wallet 真實地址(獨立硬體錢包 / 多簽) | 安全考量 — production 不要混用個人錢包 | bootstrap day |

走 `docs/runbook-launch-day.md` 一遍即可。

**接下來的選擇**:
1. **Phase 9 Earn V0.5**(律師會面 + 8 週開發 = ~10-14 週) — 新業務模式,商業核心
2. **Phase 7 Mobile App**(Flutter,~3-4 週)— backend 已經就緒,可跟 Phase 9 律師會面平行進行
3. **Phase 8 營運強化**(月對帳單、AML 監控、規模化…)
4. **Backlog 加分項**(推薦獎勵、多幣種、站內換匯…)
5. **直接準備上線**(走 launch runbook)— wallet MVP 部分

**推薦組合**:
- 立即:Phase 9 律師預約(2-4 週阻塞) + Phase 7A 啟動(平行)
- 律師綠燈後:Phase 9 W0-W8 全力推進
- 如果律師紅燈:fall back 到 V0(只 AAVE)或評估 V1(純 DeFi),或先做 Phase 7 / 8
