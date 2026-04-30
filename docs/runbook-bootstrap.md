# Runbook — Production Bootstrap

> 第一次部署到 production 時的順序。**這個流程只跑一次**,跑完務必把 KEK 備份好。

## 前置條件

- [ ] DNS 設定完(`api.quiver.io`、`app.quiver.io` A/CNAME 指到伺服器)
- [ ] HTTPS 證書就緒(Let's Encrypt 自動續期)
- [ ] PostgreSQL 16 + Redis 7 跑起來,可從 api 容器連到
- [ ] Resend / Tatum / Sentry / S3 帳號都註冊好,API key 拿到了

## Step 1 — 準備 `.env.production`

照 `.env.production.example` 把所有 key 填進去。**至少**:

```
ENV=mainnet
DATABASE_URL=postgresql+asyncpg://quiver:<strong-password>@db:5432/quiver
REDIS_URL=redis://redis:6379/0
JWT_SECRET=<openssl rand -base64 64>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
TATUM_API_KEY_MAINNET=...
RESEND_API_KEY=re_...
SENTRY_DSN=https://...@sentry.io/...
ADMIN_EMAILS=admin@quiver.io
WEBHOOK_CALLBACK_URL=https://api.quiver.io  # **不能是 ngrok**
```

> ⚠ `JWT_SECRET` 用 `openssl rand -base64 64` 產生 ≥ 32 bytes 的 secret。

## Step 2 — 跑 alembic migration

```bash
docker compose --env-file .env.production exec api alembic upgrade head
```

## Step 3 — 啟動 KEK 產生流程(/admin/setup)

1. 用第一個 admin 帳號(在 `ADMIN_EMAILS` 裡的)Google 登入 production app
2. 進 `/zh-TW/admin/setup`
3. 點「產生新 KEK」 — **這會在頁面上顯示一個 base64 字串。這是你唯一一次能看到 plain KEK 的機會。**

## Step 4 — 立即備份 KEK(關鍵步驟)

KEK 一旦遺失:**所有用戶 USDT 永久鎖死**。沒有「忘記密碼」這條路。

### 4a. 拆 Shamir Secret Sharing(3-of-5)

```bash
# 在乾淨的離線機器上
echo -n "<KEK-base64-from-page>" | ssss-split -t 3 -n 5
```

產生 5 份 share,**每份分給不同的人/地點**:
- Share 1 — CEO 個人保險箱
- Share 2 — CTO 個人保險箱
- Share 3 — 銀行保管箱(實體紙本)
- Share 4 — 信任的法務 / 會計師(實體紙本)
- Share 5 — 公司保險箱

任 3 份就能還原。**不要把 5 份都放在公司**。

### 4b. 把每份寫成「密封信封 + 撕開即知」格式

紙本卡片格式:
```
QUIVER KEK SHARE — v1
=====================
Share number: 3 / 5
Threshold: 3 (need any 3 of 5)
Generated: 2026-XX-XX
Share: <ssss output line>

復原指令:
  echo "<share>" | ssss-combine -t 3
```

放進防水信封 + tamper-evident 封條。

## Step 5 — 在 admin 後台「驗證」KEK

回 `/admin/setup`,輸入剛剛分發出去的其中一份 share,系統會:
1. 內部還原 KEK 並 hash 對比
2. hash 對得上 → 寫入 `system_keys.kek_hash` + state 變 `INITIALIZED`

從這刻起,api 容器啟動時會檢查 `KEK_CURRENT_B64` env 跟 DB hash 是否一致 — 不一致拒絕啟動。

## Step 6 — 把 KEK 放進 `.env.production` 並重啟

```
KEK_CURRENT_B64=<the same base64 string>
```

```bash
docker compose --env-file .env.production up -d --force-recreate api worker
```

啟動 log 應該看到 `kek_check_ok`。

## Step 7 — 派生平台地址

第一個 user 註冊時系統會自動 derive:
- m/44'/195'/0'/0/{user_id} — 用戶地址
- m/44'/195'/1'/0/0 — FEE_PAYER(代付 TRX gas)
- m/44'/195'/2'/0/0 — HOT wallet(提領出去從這裡)

**FEE_PAYER 需要實際 TRX 才能運作**。從 admin 個人錢包送 ≥ 100 TRX 到 FEE_PAYER 地址。

可從 `/admin/platform` 看 FEE_PAYER + HOT 地址。

## Step 8 — 觸發 Tatum 訂閱

```bash
docker compose --env-file .env.production exec api curl -s -XPOST \
  -b "quiver_session=<admin-token>" \
  https://api.quiver.io/api/admin/dev/sync-tatum
```

或進 `/admin/platform` 點 sync 按鈕。

## Step 9 — 上線前 sanity check

- [ ] `/api/healthz` 回 200
- [ ] admin 後台所有頁開得起來
- [ ] Sentry 收得到 test event(故意打一個 500)
- [ ] cron heartbeat 5 分鐘後出現在 redis(`docker exec redis redis-cli keys 'hb:cron:*'`)
- [ ] DB backup script 手跑一次(下面 runbook-backup-restore.md)
- [ ] 真的拿 mainnet 小額 USDT(例如 5 USDT)入金 → 確認 confirmations → 提領出去

## Step 10 — 把這份 runbook + 各 share 持有者紀錄寫進公司 wiki

每個 share 持有者 + 他們的聯絡方式 + 法律文件(萬一有人離職或更換),寫成單獨的「KEK 備份名單」文件,鎖在保險箱(電子版 + 紙本)。
