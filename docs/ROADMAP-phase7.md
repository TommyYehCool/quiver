# Quiver Roadmap — Phase 6E 起

> Phase 1 ~ 6D 已完成(完整 onboarding → 入金 → 內轉 → 提領 happy path 通)。
> 本文件規劃**上線前必備**(Phase 6E)+ **Mobile App**(Phase 7)+ **營運強化**(Phase 8)+ **加分項 backlog**。

---

## Phase 6E — Production Hardening(上線前必備)

> 真錢上線之前必做。建議按子 phase 順序進行,每完成一個都可獨立驗收。

### 6E-1 — 用戶 Auth 完整化(預估 2-3 hr)
- Email 驗證
  - 註冊後寄驗證信(Resend),點連結啟用
  - 未驗證信箱不能 KYC、不能提領
  - schema:`users.email_verified_at` (timestamptz nullable)
- 密碼重設
  - 「忘記密碼」連結 → 寄重設信(15 分鐘 TTL)
  - 重設頁:新密碼兩次輸入
  - schema:`password_reset_tokens` (token, user_id, expires_at, used_at)

**驗收**:新註冊帳號收到驗證信 + 點連結後狀態變 `verified` + 未驗證帳號跳提示。

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

### 6E-3 — 平台資安基本盤(預估半天)
- Audit log
  - 獨立表 `audit_logs` (actor_id, actor_kind, action, target_kind, target_id, payload jsonb, ip, user_agent, created_at)
  - 寫入時機:KYC review、提領 approve / reject / force-fail、bulk-sweep、admin 改 user 狀態、敏感讀取(看用戶 KYC 照片)
  - admin 後台加 `/admin/audit` 頁,可篩 actor / action
- Rate limiting
  - 用 Redis,以 IP + endpoint 計算
  - login: 5/min, register: 3/min, api(general): 60/min
  - 超過回 429 + Retry-After header
- 錯誤監控
  - 接 Sentry(api + worker + web),只送 5xx 與 unhandled
  - 加 release tag 串 git sha

**驗收**:後台看得到一週的 admin 操作流水、爆破登入會被擋、Sentry 收到一筆模擬錯誤。

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

### 6E-5 — 上線 checklist(預估 1 天)
- Mainnet 切換
  - `.env.production`:`USDT_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`(mainnet)、`TATUM_TRON_CHAIN=tron-mainnet`、Tatum API key 換 mainnet
  - 重新 derive 地址(用 production master seed,跟 dev seed 完全分開)
  - 提領手續費調整為 mainnet 真實 gas cost
- Master seed 產生 + 備份 runbook(`docs/runbook-bootstrap.md`)
  - 產生流程、KEK 顯示一次的注意事項、Shamir Secret Sharing 拆分(3 of 5)、實體保險箱位置紀錄
- DB 備份策略
  - PostgreSQL pg_dump 每天凌晨,送 S3(SSE-KMS),保留 30 天
  - 每週 restore drill 到測試環境
- Cron 監控
  - reconcile / sweep cron 跑完寫 heartbeat 到 Redis,heartbeat 過期 → Sentry alert
- Legal pages
  - `/terms` 服務條款、`/privacy` 隱私政策(找律師 review)
  - 註冊頁勾選同意(寫 `users.tos_accepted_at`)
- Performance
  - 開啟 Postgres 慢查詢 log
  - Next.js bundle analyzer 過一次,大頁面 code-split

**驗收**:換到 mainnet 跑一次小額 E2E、KEK 三人各持一份備份卡片、DB 還原演練成功。

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

| 優先 | 項目 | 預估 | 阻擋上線? |
|---|---|---|---|
| P0 | 6E-1 Email 驗證 + 密碼重設 | 2-3 hr | ✅ |
| P0 | 6E-3 Audit log + Rate limiting + Sentry | 0.5 day | ✅ |
| P0 | 6E-5 上線 checklist + Mainnet | 1 day | ✅ |
| P1 | 6E-2 2FA + 白名單 + 頻率上限 | 0.5 day | 強烈建議 |
| P1 | 6E-4 冷熱錢包架構 | 1 day | 強烈建議 |
| P2 | Phase 7A-D Mobile App | 3-4 週 | ❌ |
| P3 | Phase 8 各子項 | 持續 | ❌ |

**最短上線路徑**:6E-1 → 6E-3 → 6E-5 → 上線(~3 天)。
**完整上線路徑**:全部 6E → 上線(~3-4 天工作日)。
