# Quiver Roadmap

> 每個 Phase 完成後我會驗收，再進下一階段。

## Phase 0 — 釐清 ✅
8 條問題與決策，鎖定方案。

## Phase 1 — 骨架 + Auth ✅（進行中）
- Monorepo 結構（`apps/api`, `apps/web`, `apps/mobile`, `infra/`, `docs/`）
- Docker Compose 6 service（postgres / redis / api / worker / web / ngrok）
- Alembic init + `users` / `kyc_submissions` 表
- Google OAuth → JWT cookie
- Next.js login + dashboard（雙語：zh-TW / en）
- `/api/auth/me` 通

**驗收**：用 Google 登入 → dashboard 顯示「嗨，{name}」→ 可切語言。

## Phase 2 — KYC 流程
- 4 步驟 KYC 表單（基本資料 → 身分證正反 → 自拍 → 確認）
- 檔案存 local volume（路徑用 UUID）
- Admin 後台 `/admin/kyc` 審核 UI（zh-TW only）
- Resend 寄通知 email（KYC approved / rejected）

## Phase 3 — HD Wallet + 收款
- `/admin/setup` bootstrap 流程（KEK 顯示 + 強制備份 + 抽問驗證）
- AES-GCM envelope encryption（`key_version` 留給未來 rotation）
- 註冊時 derive USDT (TRC20) 地址
- Dashboard 「收款碼」 QR + 一鍵複製
- Tatum webhook → `onchain_txs (PROVISIONAL)` → 19 blocks 後 → `ledger DEPOSIT (POSTED)`
- 兩段式 UX：3 秒看到「處理中」、60 秒可動用

## Phase 4 — 內部互轉
- `accounts` / `ledger_transactions` / `ledger_entries`
- 餘額用 ledger 計算（含物化檢視 + trigger）
- 內部轉帳 API + UI（用 email / user ID）
- 紀錄頁（分頁 + 篩選）

## Phase 5 — 提領 + 平台代付 TRX
- HOT / COLD / FEE_PAYER 平台錢包
- `withdrawal_requests` + 大額（≥ $1000 USD）admin 審核
- arq worker：凍結 → 送鏈（Tatum `sendUsdtTrc20WithFeePayer`）→ 確認 → 完成
- FEE_PAYER 餘額過低告警 + 阻擋新提領
- 失敗回滾（REVERSED ledger transaction）

## Phase 6 — 對帳 + 完善
- 每日 03:00 (Asia/Taipei) 對帳：鏈上 vs ledger，差 > 0.01 USDT 寄信
- 夜間 sweep（user_wallet ≥ 10 USDT 才掃）
- 通知中心 + 推播 / email
- BitoPro 匯率（TWD 顯示，60s cache）
- Onboarding 引導（3 步泡泡）
- 深色模式（已在 Phase 1 完成基礎）
- 測試覆蓋率 ≥ 70%

## Phase 7 — Mobile App（Flutter）
- iOS + Android
- TestFlight + Google Internal Testing
- 共享：OpenAPI 生成 Dart client
- 完整功能：Dashboard、收款 QR、KYC（含相機）、互轉、提領（QR 掃描地址）
- Face ID / 指紋解鎖
- FCM 推播
