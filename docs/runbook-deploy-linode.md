# Quiver Production 部署 Runbook(Linode + Cloudflare)

> **Status**: 試營運(soft launch)等級 — 1 VPS、單機 docker compose、Cloudflare proxy 前置。
> **預估時間**:第一次跑全程 4-6 小時(含等 DNS 生效)。
> **預估費用**:~$75/月。詳見 `docs/runbook-deploy-budget.md`。
> **適用情境**:< 500 用戶試營運。如果規模 > 500 / 真要 24/7 SLA,請走 K8s / managed DB。

---

## 0. 前置 — 確認你已經有

- [ ] 一個 Cloudflare 帳號(可免費註冊)
- [ ] 一個 Linode 帳號(信用卡綁定)
- [ ] Quiver repo 在 GitHub 上(私 repo OK)
- [ ] 一個你想用的域名想法(`quiver.com` / `getquiver.app` 之類)
- [ ] 已跑完 PoC,本機 docker compose up 一切正常
- [ ] 至少 4 hr 不被打擾的時間

---

## 1. 註冊域名(Cloudflare Registrar)

1. 登入 https://dash.cloudflare.com
2. 左側 **Registrar** → **Register Domain**
3. 搜尋你要的域名 → 加入 cart → 結帳(信用卡,~$10/年 .com)
4. 結帳後 Cloudflare 會**自動**幫你設好 nameservers,DNS 區也建好了(空的)
5. 不要關 Cloudflare 視窗,等下會用

> **替代方案**:Porkbun 註冊 → 然後改 nameservers 指到 Cloudflare(多 1 步,慢 10 分鐘等生效)。

---

## 2. 開 Linode VPS

1. 登入 https://cloud.linode.com → **Create Linode**
2. 選 **Distribution**: Ubuntu 22.04 LTS
3. 選 **Region**: **Tokyo, JP**(台灣延遲 ~50ms)
4. 選 **Linode Plan**: **Shared CPU → Linode 4GB**($24/月)
5. 取個 **Linode Label**: `quiver-prod`
6. **Root Password**: 用密碼產生器產 32 字元密碼,**先存到 1Password**
7. **SSH Keys**: 加你 laptop 的 public key(`cat ~/.ssh/id_ed25519.pub`)— 沒有就先 `ssh-keygen -t ed25519`
8. 不勾 Backups(我們自己做 DB backup,他們的 backup 是整機快照,不夠細)
9. **Create Linode**

**3-5 分鐘**就 provision 完成,Status 變 RUNNING。

記下:
- **Public IPv4**(類似 `139.162.xx.xxx`)
- 之後 SSH 用 `ssh root@<IPv4>`

---

## 3. 第一次 SSH + 安全加固

```bash
# 從 laptop
ssh root@<your-linode-ip>
# 第一次會問 fingerprint,輸 yes
```

進去後跑這些(複製貼上即可):

### 3.1 系統更新

```bash
apt update && apt upgrade -y
apt install -y ufw fail2ban git curl
```

### 3.2 建非 root 用戶(SSH 用這個進來)

```bash
adduser quiver
# 設個密碼(也存 1Password)
usermod -aG sudo quiver
mkdir /home/quiver/.ssh
cp /root/.ssh/authorized_keys /home/quiver/.ssh/
chown -R quiver:quiver /home/quiver/.ssh
chmod 700 /home/quiver/.ssh
chmod 600 /home/quiver/.ssh/authorized_keys
```

### 3.3 關閉 root SSH + 改 SSH port(可選)

編輯 `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
# 可選:Port 2222(改了記得 ufw 對應放行)
```

```bash
systemctl restart ssh
```

**測試**:開新 terminal `ssh quiver@<ip>` 能進就 OK,**保留原本 root session 別關**作 fallback。

### 3.4 防火牆

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH       # 22 (或你改的 port)
ufw allow http          # 80
ufw allow https         # 443
ufw enable
```

### 3.5 安裝 Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker quiver
# 重新登入讓 group 生效
exit
ssh quiver@<ip>
docker compose version  # 確認可跑
```

---

## 4. 部署 Quiver code

從 `quiver` 用戶執行:

```bash
cd ~
git clone https://github.com/TommyYehCool/quiver.git
cd quiver
```

> **私 repo 怎麼 clone?** 用 GitHub deploy key:
> ```bash
> ssh-keygen -t ed25519 -f ~/.ssh/quiver_deploy -N ""
> cat ~/.ssh/quiver_deploy.pub
> # 貼到 GitHub repo Settings → Deploy keys → Add deploy key
> # 然後 ~/.ssh/config 加:
> # Host github.com
> #   IdentityFile ~/.ssh/quiver_deploy
> # 再 git clone git@github.com:TommyYehCool/quiver.git
> ```

---

## 5. 產生 production .env

> ⚠️ **這一步絕對不能用 dev 的 .env 抄**,production 要全新 secrets。

從 `.env.example`(若存在)起手 / 或從 dev `.env` 抄結構但**所有秘密重產**。

最危險的 4 件事:

### 5.1 Master seed + KEK

跟 dev 完全分離 — production 在 Linode 機器內**首次**產生:

```bash
# 走 docs/runbook-bootstrap.md 的流程
# 簡化:你會用 admin web UI 跑,但 KEK 必須產在 production
```

詳細走 `docs/runbook-bootstrap.md`。產出 5 份 KEK Shamir 後**立刻離線備份**(印在紙上、放保險箱、絕對不存 cloud)。

### 5.2 Production OAuth credentials

到 https://console.cloud.google.com/apis/credentials :
1. 新建 OAuth 2.0 Client(**不要重用 dev 那組 `Quiver Web`**)
2. Name: `Quiver Production`
3. Authorized JavaScript origins: `https://quiver.com`(你的域名)
4. Authorized redirect URIs: `https://quiver.com/api/auth/google/callback`
5. 拿到 client_id + client_secret 寫進 .env:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

### 5.3 Tatum mainnet API key + 訂閱付費

- 登入 Tatum dashboard → 升級到 paid plan(Free $0 / Starter $49/月起)
- 拿 mainnet API key → 寫到 .env:
  ```
  TATUM_API_KEY_MAINNET=t-xxx...
  ENV=mainnet
  ```

### 5.4 .env 全清單

```bash
# 環境
ENV=mainnet
FRONTEND_BASE_URL=https://quiver.com
API_BASE_URL=https://quiver.com
NEXT_PUBLIC_API_BASE_URL=    # 留空 = 走 nginx same-origin
SERVER_API_BASE_URL=http://api:8000

# DB
POSTGRES_USER=quiver
POSTGRES_PASSWORD=$(openssl rand -base64 32)
POSTGRES_DB=quiver
DATABASE_URL=postgresql+asyncpg://quiver:${POSTGRES_PASSWORD}@postgres:5432/quiver

# Redis
REDIS_URL=redis://redis:6379/0

# JWT (32+ chars random)
JWT_SECRET=$(openssl rand -base64 48)

# KEK (從 bootstrap 產生)
KEK_CURRENT_B64=...

# Google OAuth (production 那組!)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Tatum (mainnet paid)
TATUM_API_KEY_MAINNET=...
WEBHOOK_PATH_TOKEN=$(openssl rand -hex 16)

# Resend (production domain verified)
RESEND_API_KEY=...
RESEND_FROM=Quiver <noreply@quiver.com>

# Sentry
SENTRY_DSN_API=...
SENTRY_DSN_WEB=...

# COLD wallet (你掌控的硬體錢包地址)
COLD_WALLET_ADDRESS=T...
HOT_MAX_USDT=5000
HOT_TARGET_USDT=2000

# Admin
ADMIN_EMAILS=tommy.yeh1112@gmail.com

# (Earn / Bitfinex 等,留 dev 用,production 不需要)
```

---

## 6. Cloudflare DNS + Proxy

回 Cloudflare dashboard → 你的域名 → **DNS** → **Add record**:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `<your-linode-ip>` | 🟧 Proxied |
| A | `www` | `<your-linode-ip>` | 🟧 Proxied |

**SSL/TLS 設定**:
- Overview → 選 **Full (strict)**(需要 origin 也有 cert,我們用 Caddy 自動產)
- 或先選 **Full**(不檢查 cert chain),啟動快

**等 5 分鐘**讓 DNS propagate(可在 https://dnschecker.org 確認)。

---

## 7. 修改 nginx config 用實際域名

`infra/nginx/nginx.conf`:

```diff
  server {
    listen 80;
-   server_name _;
+   server_name quiver.com www.quiver.com;
```

---

## 8. 啟動 production stack

```bash
cd ~/quiver
docker compose up -d --build
```

第一次 build 會 5-10 分鐘。完成後:

```bash
docker compose ps   # 確認 6 個服務都 RUNNING
docker compose logs api --tail 30   # 確認沒 error
```

跑 alembic 升級到 head:

```bash
docker compose exec api alembic upgrade head
```

---

## 9. 跑 bootstrap admin

第一個 admin 是你自己。在 .env 設 `ADMIN_EMAILS=tommy.yeh1112@gmail.com`,登入後自動是 admin。

走 https://quiver.com:
1. Cloudflare warning 確認(沒 ngrok 那個)
2. 點登入 → Google OAuth(認得新 production client)
3. 進 dashboard → 切到 admin → `/admin/setup` 跑 bootstrap

走完 `docs/runbook-bootstrap.md`(KEK 抽問驗證、Master seed Shamir 拆分等)。

---

## 10. 啟動 webhook

Tatum dashboard → 設 webhook URL → `https://quiver.com/api/webhooks/tatum/{WEBHOOK_PATH_TOKEN}`

從 Quiver `/admin/setup` 跑「Sync Tatum Subscriptions」確認 webhook 註冊到所有 user。

---

## 11. Smoke test

從你 laptop / 朋友手機:
1. 開 https://quiver.com → 看到 marketing
2. Google 登入(用你自己的帳號)
3. KYC 流程跑一次(假資料,等下 admin 審核拒絕即可)
4. 收款 QR 顯示
5. 從你 TronLink **入金 1 USDT** 到自己 Quiver 地址
6. 等 < 60 秒應該 POSTED

→ **真錢通過**意味著 production 通了。

---

## 12. 設定每日備份(必做)

`/etc/cron.d/quiver-backup`:

```cron
0 3 * * * quiver /home/quiver/quiver/scripts/backup.sh > /var/log/quiver-backup.log 2>&1
```

詳細備份 / 還原流程見 `docs/runbook-backup-restore.md`。

**第 2 天先跑一次手動 restore 測試**(到另一個資料夾還原,確認可用),不然備份等於沒做。

---

## 13. 設定 uptime monitor

註冊 [BetterStack](https://betterstack.com)(免費 plan):
- HTTP Check: `https://quiver.com/healthz` 每 30 秒
- Notify:你 Email + Discord webhook

---

## 14. 完成後例行檢查

每天:
- `docker compose ps`(全 RUNNING)
- `docker compose logs api --tail 50`(無 error)
- BetterStack 通知正常

每週:
- backup 檔案有產生(`ls /var/lib/quiver-backups/`)
- Tatum 訂閱數無異常增長
- FEE_PAYER 餘額充足(Quiver `/admin/platform`)

每月:
- 跑一次 backup restore 測試
- 確認沒被 brute-force(`fail2ban-client status sshd`)

---

## 15. 發現問題怎麼回滾

**極端狀況**:剛 deploy 後發現 production 有 bug,要回到上一個 commit:

```bash
ssh quiver@<ip>
cd ~/quiver
git log --oneline -5    # 找上一個正常 commit
git reset --hard <commit-hash>
docker compose up -d --build
docker compose exec api alembic downgrade -1   # 如果有跑 migration
```

→ 把這個流程在 GitHub Actions 接 manual trigger 也行。

---

## 16. 第 2 階段(將來可選)

- Linode 升 8GB(更穩):$48/月,改 plan 不用換 IP
- DB 換成 Linode managed Postgres:$60/月
- 加 staging 環境(獨立 VPS):$24/月,完整鏡像
- 公司化:辦行號、開始合規營運

但這些**現在不用**,試營運 < 100 用戶單機完全 OK。

---

_最後更新:2026-05-01_
