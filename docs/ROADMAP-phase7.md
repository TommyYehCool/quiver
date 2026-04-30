# Quiver Roadmap — Phase 6E 起

> Phase 1 ~ 6D 已完成(完整 onboarding → 入金 → 內轉 → 提領 happy path 通)。
> 本文件規劃**上線前必備**(Phase 6E)+ **Mobile App**(Phase 7)+ **營運強化**(Phase 8)+ **加分項 backlog**。

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

### 6E-2 — 提領安全(預估半天)
- 2FA(TOTP)
  - 設定頁:QR code + 8 個備用碼
  - 提領 submit 前必驗 6 位數 code
  - schema:`users.totp_secret_enc` (envelope encrypted)
- 提領白名單地址
  - 用戶可預先綁定多個地址(命名 + 24hr 冷靜期才能用)
  - 開啟白名單模式後,只能提到白名單上的地址
  - schema:`whitelist_addresses` (user_id, address, label, activated_at)
- 提領頻率上限
  - 每用戶單日 ≤ N 筆 / 單日總額 ≤ M USD(可調)
  - 違反 → 自動 PENDING_REVIEW

**驗收**:啟用 2FA 後提領流程多一步驗證、改提領未綁定地址會被擋、單日超上限自動進審核佇列。

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

### 6E-4 — 冷熱錢包架構(預估 1 天)
> 業界標準:HOT 只放營運額度(< 20% 總資產),其餘存 COLD。

- 派生 COLD wallet(m/44'/195'/3'/0/0)
  - service:`get_platform_cold_wallet_address(db)`
  - admin 頁:COLD card(顯示地址 + USDT 餘額 only,**不存私鑰於系統**,COLD 私鑰人工離線保管)
- HOT → COLD 自動回流
  - 設定:`HOT_MAX_USDT`(例如 5000)、`HOT_TARGET_USDT`(例如 2000)
  - cron 每小時:HOT 超過 max → 推播給 admin「請執行 HOT → COLD 轉移」(因為 COLD 私鑰離線,系統不能自動簽,只能提醒)
  - admin 頁加按鈕「標記已轉移 X USDT」(寫 audit log)
- 提領前 HOT 不夠:webhook + 通知 admin 從 COLD 補 HOT

**驗收**:HOT 卡多一個 COLD 區塊、HOT 超過上限時 admin 收到通知、ledger 對帳要加 COLD 那段。

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
| P1 | 6E-2 2FA + 白名單 + 頻率上限 | 0.5 day | 強烈建議 | ⏸ |
| P1 | 6E-4 冷熱錢包架構 | 1 day | 強烈建議 | ⏸ |
| P2 | Phase 7A-D Mobile App | 3-4 週 | ❌ | ⏸ |
| P3 | Phase 8 各子項 | 持續 | ❌ | ⏸ |

**所有 P0 已清掉**。理論上現在可上 mainnet,但 P1 強烈建議補強再上(2FA + 提領白名單對提領安全 / 冷熱錢包對資金安全)。

**剩餘工作分布**:
- code 類:6E-2(0.5 day)、6E-4(1 day)
- 操作類(needs human):master seed gen / KEK 分發 / mainnet key / Sentry DSN / S3 / 律師 review
