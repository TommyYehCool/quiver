# Quiver Production 上線 Checklist

> 給 Tommy 上線前 / 中 / 後逐項勾選的清單。每一項勾完前**不要進下一階段**。
> 配合 `docs/runbook-deploy-linode.md`(怎麼做)+ 本檔(做沒做)。

---

## 階段 1:上線前 — Critical(不可逆,搞錯就重來)

> 這些是**真錢上線前**必須通過的紅線。任何一項失敗就**停下來修**,不要硬上。

### 1.1 Master Seed + KEK 🔐

- [ ] Production master seed 在 **production VPS 內**首次產生(不是 dev / 不是 laptop)
- [ ] KEK 用 Shamir 5/3 拆成 5 份
- [ ] 5 份**離線**儲存(信封 / 保險箱 / 不同實體位置)
- [ ] 5 份**永遠**沒進過 git / cloud / Email / 截圖
- [ ] 至少 1 份「測試恢復」過(實際拿出來組合驗證可行)
- [ ] `KEK_CURRENT_B64` 寫進 production .env,**.env 在 server 加密 filesystem 上**
- [ ] system_keys.kek_hash 跟 .env 的 KEK 對得上(api 啟動時 `kek_check_ok`)

### 1.2 Tatum Mainnet 設定

- [ ] Tatum **paid plan** 已升級(Free $0 不夠,Starter $49+/月)
- [ ] Mainnet API key 申請 + 寫入 .env(`TATUM_API_KEY_MAINNET`)
- [ ] Tatum dashboard 中 Webhook URL 設為 `https://your-domain.com/api/webhooks/tatum/{WEBHOOK_PATH_TOKEN}`
- [ ] 訂閱配額 ≥ 預期用戶數 + 50%(Starter plan 大概 100 個,夠初期)

### 1.3 域名 + DNS + SSL

- [ ] 域名註冊好(Cloudflare Registrar 推薦)
- [ ] Cloudflare DNS A record 指到 Linode IP(@ + www)
- [ ] Cloudflare proxy 開啟(橘色雲)
- [ ] Cloudflare SSL/TLS 模式 = **Full (strict)**
- [ ] 從 https://your-domain.com 能載入,SSL 鎖頭顯示

### 1.4 Production OAuth Credentials(獨立 dev)

- [ ] Google Cloud Console 新建 production OAuth 2.0 Client(命名 `Quiver Production`)
- [ ] Authorized JS origins: `https://your-domain.com`
- [ ] Authorized redirect URIs: `https://your-domain.com/api/auth/google/callback`
- [ ] client_id + secret 寫進 production .env(**dev 那組不要重用**)
- [ ] **OAuth consent screen** 已 publish(不是 testing 模式),否則只允許 100 個 test 用戶

### 1.5 COLD Wallet 設置

- [ ] COLD 地址用獨立硬體錢包(Ledger / TronLink),不混個人錢包
- [ ] 該錢包私鑰**不在 Quiver 系統內**(系統只存地址,從不簽)
- [ ] `COLD_WALLET_ADDRESS` 寫進 production .env
- [ ] `HOT_MAX_USDT` / `HOT_TARGET_USDT` 設好(預設 5000 / 2000 OK)
- [ ] `/admin/platform` cold wallet 卡顯示地址正確

### 1.6 平台錢包餘額

- [ ] FEE_PAYER 已加值 ≥ 200 TRX(每筆提領 ~1.4 TRX,200 TRX 夠 100 筆提領)
- [ ] FEE_PAYER 低餘額告警設好(< 100 TRX 阻擋新提領)
- [ ] HOT wallet 一開始 0,等用戶入金累積

---

## 階段 2:上線前 — 應用設定

### 2.1 環境變數

- [ ] `.env` 在 production server 上,權限 `chmod 600`
- [ ] `ENV=mainnet`
- [ ] `FRONTEND_BASE_URL` / `API_BASE_URL` 都是 `https://your-domain.com`
- [ ] `NEXT_PUBLIC_API_BASE_URL=`(空字串,讓 client 走 nginx same-origin)
- [ ] `JWT_SECRET` 32+ 字元 random(`openssl rand -base64 48`)
- [ ] `WEBHOOK_PATH_TOKEN` 16+ 字元 hex(`openssl rand -hex 16`)
- [ ] `POSTGRES_PASSWORD` 強密碼(32+ 字元)
- [ ] `ADMIN_EMAILS` 設你自己

### 2.2 Nginx config

- [ ] `infra/nginx/nginx.conf` `server_name` 改成實際域名
- [ ] X-Forwarded-Proto 設定保留(已 fix,確認 in main)
- [ ] Restart nginx 後 X-Forwarded-Proto 正確帶 https

### 2.3 Database

- [ ] Postgres docker volume 掛在 host 持久化路徑(預設 `quiver_pg_data`)
- [ ] `alembic upgrade head` 跑成功,版本 = `0013_earn_friends_tooling`(或最新)
- [ ] 用 `psql` 確認所有表存在(`\dt`)

### 2.4 Sentry

- [ ] Sentry account 開好,新建 production project
- [ ] `SENTRY_DSN_API` + `SENTRY_DSN_WEB` 寫入 .env
- [ ] api 啟動 log `init_sentry component=api`
- [ ] 觸發一個假 error 確認 Sentry 收到

### 2.5 Email(Resend)

- [ ] Resend account 開好
- [ ] Production 域名 verified(DKIM, SPF, DMARC 都綠)
- [ ] `RESEND_API_KEY` + `RESEND_FROM=Quiver <noreply@your-domain.com>` 寫入 .env
- [ ] 寄一封測試 email 到自己,確認 inbox(不在垃圾信)

---

## 階段 3:上線前 — 法律 / 業務

### 3.1 法律審

- [ ] TOS 跟 Privacy Policy 找律師看過(至少 1 hr 諮詢)
- [ ] 確認 Quiver 不被認定為「銀行」或「投顧」
- [ ] 風險揭露文字夠清楚(私鑰責任、加密貨幣風險)
- [ ] 個資保管條款合 § 27 個人資料保護法
- [ ] 律師簽認的版本上線,不只是 placeholder

### 3.2 公司 / 稅務(若有營收)

- [ ] 行號或公司登記(若會收 perf fee / 訂閱費)
- [ ] 統一發票或「免用統一發票」許可
- [ ] 開設業務帳戶分離個人金流

### 3.3 KYC 政策

- [ ] KYC SLA 公布(例如 3 工作日內審核)
- [ ] KYC 退件理由清單(模糊照片 / 過期文件 / 不符合)
- [ ] KYC 資料**保留 5 年**(台灣 AML 規定)
- [ ] KYC 拒絕後資料保留多久也明文(避免重新註冊規避)

---

## 階段 4:上線前 — 監控 + 備份

### 4.1 Backup

- [ ] cron 每日 03:00 跑 `pg_dump → S3 / Backblaze B2`
- [ ] **第 1 次手動跑 restore 測試**(`docs/runbook-backup-restore.md`)
- [ ] 確認 backup 檔可下載 + 解壓 + 還原到備援 DB
- [ ] backup 保留 30 天(舊的自動刪)
- [ ] backup 加密(若 S3 用 SSE-S3,B2 用 server-side encryption)

### 4.2 Uptime monitor

- [ ] BetterStack / UptimeRobot 設好
- [ ] HTTP check `https://your-domain.com/healthz` 每 30 秒
- [ ] HTTP check `https://your-domain.com/readyz` 每 30 秒
- [ ] Alert via Discord webhook + Email
- [ ] 故意關 api 30 秒測試 alert 確實會響

### 4.3 Log 監控

- [ ] `docker compose logs` 在 server 上 rotate(預設有 100MB cap)
- [ ] 每天 `docker compose logs api --since 24h | grep -i error` 看一遍(週末可省)
- [ ] (進階)Better Stack Logs 中央化(免費 plan 1GB/月)

### 4.4 Sentry alerts

- [ ] Sentry alert rule:每 5 min 同類 error > 10 → Discord
- [ ] Sentry alert rule:任何 SEVERITY=fatal → 立刻 Email

### 4.5 鏈上對帳

- [ ] cron 每天 03:00 跑 reconciliation(已內建)
- [ ] 對帳結果寫進 `audit_logs`
- [ ] drift > 0.01 USDT 自動 alert

---

## 階段 5:上線前 — Smoke test

> 這些**所有用真錢**,小金額即可。失敗就**不要 launch**。

- [ ] 從你 laptop 開 `https://your-domain.com` → marketing 頁面 OK
- [ ] 切繁中 / 英 / 深色模式都 OK
- [ ] Google 登入流程通(用 prod OAuth client)
- [ ] KYC 流程跑通(用真資料,你之後可以 admin 自己 approve)
- [ ] 收款 QR 顯示 + 用 TronLink 真送 1 USDT → < 60 秒 POSTED
- [ ] 內部互轉到第二個帳號 OK(可開 incognito 註冊另一個 Google)
- [ ] 提領流程通:小額 ($5) 提到你自己另一個地址 → on-chain 確認
- [ ] FEE_PAYER 餘額正確扣
- [ ] HOT wallet 跟 ledger 對得上
- [ ] (跳過 admin 大額審核 trigger,小額就 auto approved)

---

## 階段 6:上線後 — Soft launch(第 1 週)

### 6.1 邀請第一輪 5 個朋友

- [ ] 私訊發送 onboarding 訊息(包含 KYC 教學連結)
- [ ] 每個朋友** walked-through onboarding**(視訊 / 群組指引)
- [ ] 朋友先存 < $50 USDT 試水溫
- [ ] **第 1 週**每天看一次 logs / Sentry / 用戶餘額

### 6.2 觀察指標

- [ ] 每天紀錄:總 USDT 入金 / 提領 / 用戶數 / 失敗 tx 數
- [ ] 抓 user feedback 文字(會用 / 不會用的點)
- [ ] 沒人投訴「我的錢呢?」(任何此類訊息要立刻 prio 1)

---

## 階段 7:上線後 — Closed beta(第 2-4 週)

- [ ] 邀 20-30 人(朋友的朋友、社群熟人)
- [ ] 開始公布 marketing URL(社群媒體可發)
- [ ] **不**正式公開註冊(KYC pending → admin 手動 approve 防詐騙)
- [ ] 用真實 KYC 跑一輪(有些朋友照片會模糊,你練手)
- [ ] 觀察 server resource(CPU / RAM / 磁碟),低於 50% 才放心

---

## 階段 8:上線後 — Open beta(第 1-3 月)

- [ ] 開放公開註冊
- [ ] 增加 KYC auto-approve 條件(可選,先保守)
- [ ] AML monitoring 規則啟用(單日多筆 / 黑名單 / 大額首提)
- [ ] 進階觀察:看是否有詐騙嘗試
- [ ] 第 1 個月底:**做一份 retrospective**(什麼 work / 什麼壞 / 該砍 / 該加)

---

## 階段 9:上線後 — Earn beta(第 3 月後)

> 等律師 review V0.5 plan / Friends Tooling 的法律意見。

- [ ] 律師意見書到手
- [ ] 簽好用戶協議律師起草版
- [ ] 邀請 friend tier 朋友加 earn_account
- [ ] 跑出第一份月度 earnings report

---

## 緊急應變 playbook

### 用戶錢不見了 / 餘額顯示錯誤
1. **不要 panic** — 檢查是否只是 cache 問題(reload 一次)
2. 比對 ledger vs 鏈上(`/admin/platform`)
3. 寫 audit_log 紀錄
4. 私訊用戶說明調查中
5. 當天回覆

### Server 整個掛
1. SSH 進 Linode 看 `docker compose ps`
2. 重啟個別服務 `docker compose restart api`
3. 不行就 `docker compose down && docker compose up -d`
4. 還是不行 git revert 到上個正常 commit
5. **絕對不要**直接 wipe DB

### Tatum / Bitfinex 中斷
1. 等 30 分鐘觀察(他們的事)
2. 公開公告:「外部服務維護,提領暫緩」
3. 用戶資料還是好的,不要 trigger refund

### 被 hack 嫌疑
1. **立刻** 停 api 服務
2. 檢查 audit_logs 看哪個帳號被動
3. 凍結相關用戶
4. 通知律師 + 受影響用戶
5. 不要 cover up

---

## Critical numbers to know (你心裡要有)

| 指標 | 健康範圍 | 異常時 |
|---|---|---|
| FEE_PAYER TRX | > 200 TRX | 阻擋提領,補錢 |
| HOT USDT | < 5000 | 移到 COLD |
| Tatum API quota | < 80% used | 升級 plan |
| DB disk | < 70% | 加大 / 清舊 audit log |
| Sentry errors / day | < 50 | 排查 |
| Failed login / hour | < 100 | 看 IP 規律 |

---

## 文件參考

- 部署:`docs/runbook-deploy-linode.md`
- bootstrap:`docs/runbook-bootstrap.md`
- 備份還原:`docs/runbook-backup-restore.md`
- mainnet 切換:`docs/runbook-mainnet-cutover.md`
- launch day:`docs/runbook-launch-day.md`
- CI/CD:`docs/runbook-cicd-deploy.md`
- 預算:`docs/runbook-deploy-budget.md`

---

_最後更新:2026-05-01_
