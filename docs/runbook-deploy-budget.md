# Quiver Production 部署 — 預算 + 服務申請 Walkthrough

> 詳細所有要花錢的地方 + 怎麼申請 step-by-step。
> 所有費用 USD,參考 2026-05 行情。

---

## 預算總表

### 🟢 Tier 0:**最小可上線**(月 ~$75 / NT$2400)

| 服務 | 用途 | 必要? | 月費 | 年費 |
|---|---|---|---|---|
| Linode 4GB Tokyo | VPS(api / web / db / redis) | ✅ | $24 | $288 |
| Cloudflare(Registrar + DNS + Proxy) | 域名 + DNS + DDoS + SSL | ✅ | ~$1 | $10 |
| Tatum Starter | mainnet API + 訂閱 | ✅ | $49 | $588 |
| Resend | transactional email | ✅ | $0 | $0(< 100/day 免費) |
| Sentry | error tracking | ✅ | $0 | $0(< 5K errors/月) |
| BetterStack | uptime monitor | ⚠️ | $0 | $0(免費 plan)|
| **小計** | | | **~$75** | **~$886** |

### 🟡 Tier 1:**穩定試營運**(月 ~$110 / NT$3500)

加上:

| 服務 | 用途 | 月費 |
|---|---|---|
| Backblaze B2 | DB backup off-site(每天 ~50MB,留 30 天) | $0.02 |
| Discord(免費) | deploy 通知 | $0 |
| Tatum 升級到 Pro | 訂閱配額更多(若 user > 50) | $99 (升 $50) |
| BetterStack Logs | 中央化 log(可選) | $0(免費 1GB/月) |
| **小計多** | | **~$50** |

### 🔴 Tier 2:**正式上線**(月 $300+,等用戶 > 500)

- VPS 升 8GB / 16GB 或拆 db 到 managed Postgres
- Cloudflare Pro($20/月,WAF + 進階 analytics)
- Sentry Team ($26/月,erros / replays)
- 律師 retainer NT$30K-100K 一次,可分攤

→ **試營運不需要**,先 Tier 0/1 跑出第一批用戶再升。

---

## 服務 1:Cloudflare(域名 + DNS + Proxy + SSL)

### 為什麼選 Cloudflare

- Registrar 是 at-cost(其他 registrar 都加 markup)
- DNS、proxy、SSL、DDoS 全免費 plan 涵蓋
- 同一介面省心

### 申請步驟

1. **註冊 Cloudflare**:https://dash.cloudflare.com/sign-up
   - Email + password
   - 跳過 plan 選擇(免費 Free plan 就好)

2. **加你的域名**(若已別處註冊):
   - Add a Site → 輸入域名 → 選 Free plan
   - Cloudflare 自動掃既有 DNS records
   - 改 nameservers 到 Cloudflare(在你舊 registrar 設定)
   - 等 24 小時生效

3. **或直接 Cloudflare 註冊新域名**(推薦):
   - 左側 Registrar → Register Domain
   - 搜尋你要的域名
   - 結帳:`.com` ~$10/年,綁信用卡
   - 5 分鐘自動 setup

4. **DNS records**(部署 Linode 後設定):
   - DNS → Records → Add
   - A `@` → `<linode-ip>` → Proxy 開啟(橘雲)
   - A `www` → `<linode-ip>` → Proxy 開啟

5. **SSL/TLS 模式**:
   - SSL/TLS → Overview → 選 **Full (strict)**(production)
   - 第一週可先用 **Full**(不檢查 origin cert)

### 預估月費

- 域名 .com: $10/年 = $0.83/月
- DNS / Proxy / SSL: $0
- **合計:< $1/月**

---

## 服務 2:Linode VPS

### 為什麼選 Linode

- Tokyo 機房(台灣延遲 ~50ms)
- 介面簡單,信用卡綁定後 5 分鐘開機
- $24/月 = 4GB / 80GB SSD / 4TB transfer 對試營運綽綽有餘

### 申請步驟

1. **註冊 Linode (現屬 Akamai)**:https://login.linode.com/signup
   - Email + 信用卡
   - 第一次有時候要驗證身份(政策因國家不同)

2. **Create Linode**:
   - Distribution: **Ubuntu 22.04 LTS**
   - Region: **Tokyo, JP**
   - Plan: **Shared CPU → Linode 4GB**($24/月)
   - Label: `quiver-prod`
   - Root Password: 32 字元 random,**存 1Password**
   - SSH Keys: 加你 public key
   - 不勾 Backups(他們的整機快照,不夠細)
   - **Create Linode**

3. **3-5 分鐘**進入 RUNNING

4. SSH 進去走 `docs/runbook-deploy-linode.md` 流程

### 預估月費

- Linode 4GB: **$24/月**
- 升級 8GB: $48/月(用戶 > 200 後考慮)
- 升級 16GB: $96/月

### 替代方案

| 服務 | 月費 | 注意 |
|---|---|---|
| AWS Lightsail Tokyo 4GB | $24 | 介面較不直覺 |
| DigitalOcean Singapore 4GB | $24 | 對台延遲 80ms 較慢 |
| Hetzner CX22 (Falkenstein) | $5 | 歐洲機房,延遲 250ms+,不推給台灣用戶 |
| Vultr Tokyo 2GB | $14 | 較小,可能 4GB 比較穩 |

---

## 服務 3:Tatum(mainnet API + Webhook 訂閱)

### 為什麼**必須付費**

- Free tier 限 5 個 subscription,**第 6 個用戶註冊就爆**
- Mainnet API 也有 rate limit,試營運會踩

### 申請步驟

1. **註冊**:https://dashboard.tatum.io
   - Email + verification

2. **升級 plan**:
   - Account → Billing → Upgrade
   - **Starter** $49/月($499/年):
     - 100 subscriptions
     - 500K credits/月
     - mainnet 全鏈
   - **Pro** $99/月($999/年):
     - 500 subscriptions
     - 5M credits/月
     - 用戶 > 100 後升

3. **生 mainnet API key**:
   - API Keys → Create new key
   - Name: `quiver-prod-mainnet`
   - Network: **Mainnet**
   - 複製 key,寫入 .env `TATUM_API_KEY_MAINNET=...`

4. **設 webhook URL**:
   - Notifications → Webhooks → Add
   - URL: `https://your-domain.com/api/webhooks/tatum/{WEBHOOK_PATH_TOKEN}`
   - 你的 .env 裡 `WEBHOOK_PATH_TOKEN` 要跟 webhook URL 一致

### 預估月費

- Starter: **$49/月**
- 用戶 > 50 升 Pro: $99/月

---

## 服務 4:Resend(Email)

### 為什麼選 Resend

- 介面比 SendGrid / Mailgun 簡單
- 免費 plan 100/day 對試營運夠用
- 強制 DKIM / SPF,不易進垃圾信

### 申請步驟

1. **註冊**:https://resend.com/signup
2. **驗證域名**:
   - Domains → Add Domain → 輸入 `your-domain.com`
   - Resend 給你 4 條 DNS record(MX / TXT / DKIM / DMARC)
   - 全部加到 Cloudflare DNS
   - 24 小時內全綠
3. **生 API key**:
   - API Keys → Create
   - 寫入 .env `RESEND_API_KEY=re_...`
4. **設 from address**:
   - .env: `RESEND_FROM=Quiver <noreply@your-domain.com>`

### 預估月費

- < 100/day:**$0**
- 100-3000/day:$20/月
- 試營運很難達到,先 free 即可

---

## 服務 5:Sentry(Error tracking)

### 申請步驟

1. **註冊**:https://sentry.io/signup
2. **建 organization**:`quiver` 之類
3. 建 2 個 project:
   - `quiver-api`(Python / FastAPI platform)
   - `quiver-web`(Next.js)
4. 每個 project 拿 DSN:
   - Project Settings → Client Keys → 複製 DSN
5. 寫入 .env:
   ```
   SENTRY_DSN_API=https://...@o123.ingest.sentry.io/456
   SENTRY_DSN_WEB=https://...@o123.ingest.sentry.io/789
   ```

### Alert rules(必設)

到 Alerts → Create Alert → For: `Number of errors`:
- Filter: `level:fatal` → email + Discord(立刻)
- Filter: `count > 10 in 5 min` → Discord(避免噪音)

### 預估月費

- Free plan:5K errors/month、30-day retention,試營運夠
- Team plan $26/月:50K errors,replays,推薦 > 100 用戶後

---

## 服務 6:BetterStack(Uptime monitor)

### 申請步驟

1. **註冊**:https://betterstack.com/signup
2. **Uptime → Create monitor**:
   - URL: `https://your-domain.com/healthz`
   - Check every: **30 seconds**
   - Alert via:
     - Email: 你自己
     - (可選)SMS / Phone call(付費 plan)
     - Discord(用同一個 webhook)
3. 重複建一個 `https://your-domain.com/readyz` monitor(讀 DB)

### 預估月費

- **Free plan**:10 monitors / 30s check / Email alert,試營運夠
- Pro $24/月:phone/SMS、status page

---

## 服務 7:Backblaze B2(DB backup)

### 為什麼選 B2

- S3 相容,但便宜 5x($6/TB vs $23/TB)
- 試營運 backup < 50GB,基本免費

### 申請步驟

1. **註冊**:https://www.backblaze.com/b2/sign-up.html
2. **建 bucket**:
   - Name: `quiver-prod-backups`
   - Files in Bucket: **Private**
   - Default Encryption: **B2-managed**
   - Object Lock: 試營運不開
3. **Application Key**:
   - App Keys → Add a New Application Key
   - Name: `quiver-prod-backup`
   - Allow Access to: 該 bucket
   - Type: Read and Write(產出 keyID + applicationKey)
4. **裝 b2 CLI 在 Linode**:
   ```bash
   pip install b2
   b2 authorize-account <keyID> <applicationKey>
   ```
5. **Backup script**:
   ```bash
   #!/bin/bash
   # /home/quiver/quiver/scripts/backup.sh
   set -e
   DATE=$(date +%Y%m%d-%H%M)
   docker compose exec -T postgres pg_dump -U quiver quiver | gzip > /tmp/quiver-${DATE}.sql.gz
   b2 upload-file quiver-prod-backups /tmp/quiver-${DATE}.sql.gz quiver-${DATE}.sql.gz
   rm /tmp/quiver-${DATE}.sql.gz
   # 保留 30 天:刪 30 天前的
   b2 ls quiver-prod-backups | awk '{print $7}' | while read fn; do
     # 簡化版:只保留最近 30 個檔
     :
   done
   ```
6. **加到 cron**:
   ```bash
   sudo crontab -e -u quiver
   # 加一行
   0 3 * * * /home/quiver/quiver/scripts/backup.sh > /var/log/quiver-backup.log 2>&1
   ```

### 預估月費

- 試營運 < 50GB:**$0.50/月**
- 1TB:$6/月

---

## 服務 8:Discord(deploy 通知 + alert)

### 申請步驟(免費)

1. 開 Discord,新建 server `Quiver Ops`(只有你自己也行)
2. 建 channels: `#deploy`, `#alerts`, `#errors`
3. 各 channel 設 Webhook:
   - Channel Settings → Integrations → Webhooks → New
   - 命名 + 選 channel
   - Copy Webhook URL
4. 寫入 GitHub Actions secret + Sentry alert + BetterStack alert

### 預估月費

- **$0**

---

## 一次性成本(初期投資)

| 項目 | 費用 | 說明 |
|---|---|---|
| 域名年繳 | $10 | Cloudflare |
| 律師諮詢 | NT$5K-10K | 1-2 小時,review TOS / Privacy |
| 公司 / 行號登記(若需要)| NT$3K-5K | 行號 vs 公司 |
| 1Password Family $5/月 | $5 | 強烈建議,管 production secrets |
| 硬體錢包(Ledger Nano S)| ~$80 | COLD wallet 用 |
| **小計** | **~NT$10K** | 一次性 |

---

## 第 1 年 total budget 試算

| 月 | 平均月費 | 說明 |
|---|---|---|
| M1 | $75 | Tier 0,試營運 5 朋友 |
| M2-3 | $75 | Closed beta 30 人 |
| M4-6 | $110 | 升 Tatum Pro,加 backup |
| M7-12 | $150 | 用戶 > 100 後升 Sentry / 加 staging |

→ **第一年 total: ~$1500 USD = ~NT$48K**

加一次性成本,**NT$60K** 跑得出 production 試營運一整年。

---

## 信用卡準備清單

申請以上服務需要的信用卡(以下都接受台灣信用卡):

- [ ] Cloudflare(域名 + Pro plan 若需)
- [ ] Linode(月扣)
- [ ] Tatum(月扣)
- [ ] Resend(若超免費 tier)
- [ ] Sentry(若升級)
- [ ] BetterStack(若升級)
- [ ] Backblaze B2(用量計費,< $1)

→ 用 1 張外幣 / 訂閱專用卡管,月底好對帳。

---

## 不建議的省錢方式

| ❌ 不要做 | 為什麼 |
|---|---|
| 用 Cloudflare 免費 plan + 自簽 cert | 看似 work,但 SSL 警告會嚇跑用戶 |
| 用 Hetzner 歐洲機房 | $5/月看起來香,但 250ms 延遲讓 UX 很差 |
| 自架 Postgres 在同台 VPS 不備份 | 上線首月最容易 fail,沒備份就完了 |
| 用 Tatum free tier 撐 | 第 6 個用戶就爆,丟臉 |
| 不用 Sentry 不裝 monitor | 用戶遇到 bug 你不知道 |
| 用 dev OAuth client 上 production | 風險高,user 看到「Quiver Web (Dev)」 |
| 把 KEK 存 1Password | 雲端洩漏=死,只能離線存 |

---

## 信用卡 / 國外服務小撇步

- 信用卡能設**訂閱限額**最好(比如 $200/月上限),避免被 fraud
- 訂閱信用卡帳單**設手機推播**,異常立刻知道
- 有些服務(如 Linode)**免費 $100 credit** 給新戶,搜「Linode promo code」可拿
- Tatum 偶爾有 **promo code 50% off** 第一年,客服直接問

---

## 我做完上面這些,大概要花多少時間?

| 階段 | 時間 |
|---|---|
| 申請帳號(8 個服務)| 1.5 hr |
| Linode setup + SSH 設定 | 1.5 hr |
| Domain + DNS + Cloudflare | 0.5 hr(等 DNS 1 小時)|
| Production .env + KEK bootstrap | 1.5 hr(走 runbook)|
| GitHub Actions + secrets | 0.5 hr |
| 第一次 deploy + 驗證 | 1 hr |
| Backup + uptime + Sentry alert | 1 hr |
| **總計** | **7-8 hr** |

可以分 2 個週末弄完。

---

_最後更新:2026-05-01_
