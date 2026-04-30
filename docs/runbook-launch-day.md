# Runbook — Launch Day

> 上線當天從零到開放註冊的 step-by-step。預估 4-6 小時(含 sanity test 24hr 觀察)。

## T-7 days(出發前一週)

- [ ] `.env.production` 全部 key 集齊(看 `.env.production.example`)
- [ ] DNS 設定完成(`api.quiver.io`、`app.quiver.io`、`status.quiver.io`)
- [ ] HTTPS 證書(Let's Encrypt 自動)
- [ ] 雲服務帳號:AWS / Tatum (paid plan) / Sentry / Resend / Google Cloud (OAuth)
- [ ] 公司保險箱 / 銀行保管箱位置確認
- [ ] 律師 review 完 `/legal/terms` + `/legal/privacy`(把佔位符換成正式內容)
- [ ] `docs/runbook-bootstrap.md` 走過一遍 sandbox

## T-1 day

- [ ] 跑 `docs/runbook-backup-restore.md` 的 restore drill 一次,驗證流程
- [ ] Pre-fire 通知:5 個 KEK share 持有者都在線 + 確認接電話
- [ ] CTO + CEO 確認當天行程,可即時介入

## T-0 day(launch day)

### 09:00 — 初始化

- [ ] 跑 `docs/runbook-bootstrap.md` step 1 ~ 9
- [ ] 5 份 KEK share 物理發放 + 簽收
- [ ] FEE_PAYER 入 500 TRX
- [ ] HOT 入 1 TRX 啟用帳戶

### 10:00 — Sanity test(內部)

僅開放 admin 帳號:

- [ ] admin Google 登入 → `/zh-TW/dashboard` OK
- [ ] admin KYC 流程走完
- [ ] admin 入 5 USDT mainnet(從外部錢包送)→ 60 秒內 POSTED
- [ ] admin 內轉 1 USDT 給另一個內部測試帳號 → 即時到帳
- [ ] admin 提領 3 USDT 到外部錢包 → 90 秒內 COMPLETED
- [ ] 對 audit log 看上面所有動作都有寫入
- [ ] 對 `/admin/platform` 看 HOT 拆解正確(用戶餘額 + 平台獲利)
- [ ] 跑一次 `/admin/dev/reconcile` → 無 flag

### 12:00 — 監控 24 小時

- [ ] Sentry 收 test event
- [ ] cron heartbeat 全部正常(`hb:cron:sweep_all` / `hb:cron:reconcile`)
- [ ] backup script 手動跑一次 → S3 看到檔
- [ ] FEE_PAYER 餘額無異常下降(沒有奇怪 leak)

### T+1 day

reconcile cron 凌晨 03:00 自動跑 — 確認無 flag。

### T+2 day — 軟啟動

- [ ] 開放給 5 個內測用戶(已知聯絡)
- [ ] 觀察 24 小時
- [ ] 任一 incident → 暫停軟啟動

### T+5 day — 公開上線

- [ ] 拿掉維護中頁,Google OAuth 設 Production
- [ ] 公告(網站 / 社群 / email list)
- [ ] On-call shift 排好,72 小時內 24x7 有人在

## 上線後第一週重點檢查

每天下班前:
- 對 `/admin/audit` 看當日所有動作
- 對 `/admin/platform` 看 HOT / FEE_PAYER 餘額
- 看 Sentry inbox(目標:0 unhandled)
- 看 reconcile cron 跑完無 flag

每週:
- restore drill
- review FEE_PAYER 補 TRX 預估(下次什麼時候要再補)
- review backup 有沒有正常上 S3

## Incident response(粗略)

| 嚴重度 | 範例 | 動作 |
|---|---|---|
| P0 | 用戶看到別人的餘額;ledger 對不上鏈;HOT 餘額異常下降 | 立刻維護中頁,CTO + CEO + 法務同時 join,排查 |
| P1 | api 慢但能回應;某 endpoint 5xx | Sentry 看 trace,排修,於下個 deploy window 修 |
| P2 | UI 小 bug、文案 typo | 一般 PR + review |

P0 / P1 必須事後寫 incident report + post-mortem,加入 audit log。
