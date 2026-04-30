# Runbook — Backup & Restore

> 沒測過的備份等於沒備份。**每週做一次 restore drill**。

## 備份策略

| 物件 | 頻率 | 保留 | 加密 | 工具 |
|---|---|---|---|---|
| PostgreSQL | 每日 03:30 (Asia/Taipei) | 30 天 hot, 1 年 glacier | S3 SSE-KMS | `infra/backup/pg_dump.sh` |
| KEK | 一次,實體 | 永久 | 物理 + Shamir | 紙本 / 保險箱 |
| Master seed | 一次,實體 | 永久 | 物理 + 抄寫 | 紙本 / 保險箱 |
| Tatum API key | env | — | env (HSM 更佳) | — |
| Resend / Sentry / GCP credentials | env | — | env | — |
| 應用 code | git push | 永久 | TLS | git remote |

## 設定 cron

### 選 1:k8s CronJob(production 推薦)

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: quiver-pg-backup
spec:
  schedule: "30 19 * * *"  # 03:30 Asia/Taipei = 19:30 UTC
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: <registry>/quiver-backup:latest  # build from infra/backup/Dockerfile
              envFrom:
                - secretRef:
                    name: quiver-backup-env
```

### 選 2:host crontab(單機部署)

```bash
# /etc/cron.d/quiver-backup
30 3 * * * root cd /opt/quiver && \
  docker run --rm --env-file infra/backup/backup.env \
    --network quiver_default \
    quiver-backup:latest >> /var/log/quiver-backup.log 2>&1
```

## 手動跑一次 backup(測試用)

```bash
cd infra/backup
docker build -t quiver-backup .

docker run --rm \
  --network quiver_default \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_USER=quiver \
  -e PGPASSWORD=$(grep POSTGRES_PASSWORD .env | cut -d= -f2) \
  -e POSTGRES_DB=quiver \
  -e BACKUP_S3_BUCKET=my-quiver-backups \
  -e BACKUP_S3_KMS_KEY_ID=arn:aws:kms:... \
  -e AWS_ACCESS_KEY_ID=... \
  -e AWS_SECRET_ACCESS_KEY=... \
  -e AWS_DEFAULT_REGION=ap-northeast-1 \
  quiver-backup:latest
```

成功會看到 `[backup] done` + S3 console 看得到新檔。

## Restore drill(每週)

目的:**驗證 backup 真的能還原 + 練手**。

### 1. 起一個全新空的 postgres(測試環境)

```bash
docker run -d --name pg-drill \
  -e POSTGRES_PASSWORD=drill \
  -e POSTGRES_USER=drill \
  -e POSTGRES_DB=drill \
  -p 5433:5432 \
  postgres:16-alpine
```

### 2. 拉最近一份 backup 還原

```bash
docker run --rm \
  --network host \
  -e POSTGRES_HOST=localhost \
  -e POSTGRES_USER=drill \
  -e PGPASSWORD=drill \
  -e BACKUP_S3_BUCKET=my-quiver-backups \
  -e AWS_ACCESS_KEY_ID=... \
  -e AWS_SECRET_ACCESS_KEY=... \
  -e AWS_DEFAULT_REGION=ap-northeast-1 \
  -p 5433:5432 \
  quiver-backup:latest \
  /usr/local/bin/restore.sh quiver/2026/04/quiver-20260430T193000Z.dump drill
```

### 3. 驗證資料完整

```bash
docker exec pg-drill psql -U drill -c "
  SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM ledger_entries) AS entries,
    (SELECT COUNT(*) FROM withdrawal_requests) AS withdrawals,
    (SELECT COUNT(*) FROM audit_logs) AS audits;
"
```

跟 production 數字比對,差距合理(差幾筆是 cutover 後的新交易,正常)。

### 4. 隨機抽一個 user,確認餘額還原一致

```bash
docker exec pg-drill psql -U drill -c "
  SELECT u.email,
    (SELECT COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN le.amount ELSE -le.amount END), 0)
     FROM ledger_entries le JOIN accounts a ON le.account_id = a.id
     WHERE a.user_id = u.id AND a.kind = 'USER') AS balance
  FROM users u WHERE u.id = 1;
"
```

跟 production 同個 user 比對。

### 5. 銷毀 drill 容器

```bash
docker rm -f pg-drill
```

### 6. 寫日誌

`docs/drill-log.md` 加一行:`2026-XX-XX | drill OK | <duration>`。連續兩次失敗 → incident。

## 災難復原(真出事時)

順序:
1. **不要 panic**。先確認災情範圍(只 DB 壞 / 整台機器掛 / 整個 region 掛)
2. 開維護中頁(nginx 5xx static)
3. 用最近一份 backup restore 到新 DB instance
4. 應用 cutover:`.env.production` 改 `DATABASE_URL` 指向新 DB
5. 啟動 api / worker,確認 `kek_check_ok`
6. 監控 audit log + reconciliation 跑一次
7. 復原服務、寫 incident report、發告 user
