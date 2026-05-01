# Quiver CI/CD — GitHub Actions Deploy Runbook

> 設定一次,之後 `git push origin main` 就自動 deploy 到 production。
> Rollback 走 `Actions → Rollback Production → Run workflow`。

---

## 流程概覽

```
┌────────────────────────────────────────────────────────────┐
│  你 push to main                                            │
│  ↓                                                          │
│  GitHub Actions deploy.yml 跑                               │
│  ↓                                                          │
│  SSH → Linode → git pull → docker build → migration         │
│  ↓                                                          │
│  zero-downtime recreate api / worker / web                  │
│  ↓                                                          │
│  health check + smoke test                                  │
│  ↓                                                          │
│  Discord 通知成功 / 失敗                                     │
└────────────────────────────────────────────────────────────┘
```

---

## 一次性 setup(全程 ~30 分鐘)

### 1. 在 Linode 上產生專屬 deploy SSH key

```bash
# SSH 到 Linode 後
ssh-keygen -t ed25519 -f ~/.ssh/quiver_gha_deploy -N "" -C "github-actions-deploy"

# 加到 quiver 用戶的 authorized_keys
cat ~/.ssh/quiver_gha_deploy.pub >> ~/.ssh/authorized_keys

# 把 PRIVATE key 印出來,等下 copy 到 GitHub secret
cat ~/.ssh/quiver_gha_deploy
# (整段 -----BEGIN OPENSSH PRIVATE KEY----- 到 -----END...-----)
```

### 2. 開 Discord webhook(可選,但建議)

1. 你 Discord server 的設定 → Integrations → Webhooks → New Webhook
2. 命名 `Quiver Deploy`,選一個 channel
3. Copy Webhook URL

### 3. 在 GitHub repo 設 secrets

到 repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret 名稱 | 內容 | 範例 |
|---|---|---|
| `PROD_HOST` | Linode IP 或域名 | `139.162.xx.xxx` |
| `PROD_DOMAIN` | 你的對外域名(無 https://) | `quiver.com` |
| `PROD_SSH_KEY` | 上一步產的 PRIVATE key 全文 | `-----BEGIN OPENSSH...` |
| `DISCORD_WEBHOOK_URL` | Discord webhook | `https://discord.com/api/webhooks/...` |

### 4. 在 GitHub repo 設 environment

到 Settings → Environments → New environment → 命名 `production`:
- 開「Required reviewers」(可選但建議):需要你 approve 才會跑 deploy
- 預設這就鎖住任何 push 都要你按 approve,適合試營運初期防止意外

### 5. 確認 Linode 端 git remote

```bash
# SSH 到 Linode 的 quiver 用戶
cd ~/quiver
git remote -v
# 應該看到 origin git@github.com:TommyYehCool/quiver.git

# 測試 git fetch 通(用 deploy key)
git fetch origin
```

---

## 試跑一次

```bash
# 從 laptop
git push origin main
```

到 GitHub repo → Actions → 「Deploy to Production」→ 點該次 run 看 log。

**預期**:
- ✓ Checkout repo
- ✓ Set up SSH key
- ✓ Pull latest code on server
- ✓ Build images(2-5 分鐘)
- ✓ Run alembic migrations
- ✓ Recreate services
- ✓ Wait for healthy
- ✓ Public smoke test
- ✓ Discord 收到 ✅ 訊息

如果 environment 設了「Required reviewers」,你會看到「Waiting for approval」,點 approve 後才繼續。

---

## 遇到問題的回滾流程

### 簡單情況:rollback 到上一個 commit

```bash
# Quiver repo → Actions → Rollback Production → Run workflow
# 填:
#   target_ref: <上一個正常 commit SHA>(從 git log 找)
#   reason: "新 commit X 導致 bug Y"
```

### 完整還原:rollback 到 wallet-v1.0 tag

```
target_ref: wallet-v1.0
run_alembic_downgrade: false   (除非你確定 schema 沒衝突)
reason: "重大 issue,先回 stable tag"
```

---

## 設計決策(為什麼這樣做)

### 為什麼用 SSH 而不是 docker registry push?

- 試營運階段就 1 台機器,push 到 registry 反而多 1 跳
- SSH key 控管簡單,private repo 也 work
- > 100 用戶時應該升級到 GHCR 或 Docker Hub + image tag pin

### 為什麼 migration 跑在 `docker compose run --rm`?

- 用一次性容器,不會把現役 api 暫停
- 失敗時 cleanup 乾淨
- migration 失敗不會讓 api 進入半 broken state

### 為什麼需要 Required reviewers?

- 試營運初期,任何 deploy 都應該你親自 approve
- 防止你 commit 一個半完成的 branch 不小心被 merge → 立刻自動 deploy
- 上線穩定後可拿掉

### 為什麼跳過 docs/* 變動?

- `paths-ignore: docs/**, **.md` 設定讓你寫文件不會誤 trigger production deploy
- 純 code 變動才 deploy

---

## 升級路徑

當你規模 > 500 用戶 / 有 staging 環境需求時:

1. **加 staging 環境**:
   - 開另一台 Linode($24/月)
   - 多寫 `.github/workflows/deploy-staging.yml`
   - push to `staging` branch → deploy staging
   - merge to `main` → deploy production

2. **改用 docker registry**:
   - GitHub Actions build push to GHCR
   - SSH 只跑 `docker pull` + `docker compose up`
   - 加快 deploy(不用每次 build,改 push image)

3. **加 PR-based testing**:
   - 開 PR → 自動跑 pytest / lint
   - 不通過不能 merge

但這些**現在不用**,試營運保持簡單就好。

---

## 緊急狀況:GitHub Actions 也壞了

退路:直接 SSH 上去手動 deploy

```bash
ssh quiver@<linode-ip>
cd ~/quiver
git pull origin main
docker compose build api worker web
docker compose run --rm api alembic upgrade head
docker compose up -d --no-deps api worker web nginx
curl http://localhost:8000/healthz
```

---

_最後更新:2026-05-01_
