#!/bin/sh
# phase 6E-5: PostgreSQL nightly dump → S3
#
# 設計:
# - 用 pg_dump custom format(-Fc),壓縮 + 可選表 restore
# - 上傳 S3 走 SSE-KMS 加密(KMS key 由 env 給)
# - lifecycle policy 由 S3 那邊設(保留 30 天 → glacier → delete)
# - 失敗 → exit non-zero,讓 cron / monitoring 抓
#
# 環境變數(必填):
#   POSTGRES_HOST          (e.g. postgres)
#   POSTGRES_USER          (e.g. quiver)
#   PGPASSWORD             (postgres 密碼)
#   POSTGRES_DB            (e.g. quiver)
#   BACKUP_S3_BUCKET       (e.g. my-quiver-backups)
#   BACKUP_S3_KMS_KEY_ID   (KMS key arn)
#   AWS_ACCESS_KEY_ID
#   AWS_SECRET_ACCESS_KEY
#   AWS_DEFAULT_REGION     (e.g. ap-northeast-1)

set -euo pipefail

: "${POSTGRES_HOST:?POSTGRES_HOST required}"
: "${POSTGRES_USER:?POSTGRES_USER required}"
: "${PGPASSWORD:?PGPASSWORD required}"
: "${POSTGRES_DB:?POSTGRES_DB required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET required}"
: "${BACKUP_S3_KMS_KEY_ID:?BACKUP_S3_KMS_KEY_ID required}"

TS=$(date -u +%Y%m%dT%H%M%SZ)
FILENAME="quiver-${TS}.dump"
LOCAL_PATH="/tmp/${FILENAME}"

echo "[backup] starting pg_dump ${POSTGRES_DB} @ ${POSTGRES_HOST} → ${LOCAL_PATH}"
pg_dump \
  --host="${POSTGRES_HOST}" \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="${LOCAL_PATH}"

SIZE=$(du -h "${LOCAL_PATH}" | cut -f1)
echo "[backup] dump complete, size=${SIZE}"

S3_KEY="quiver/${TS:0:4}/${TS:4:2}/${FILENAME}"
echo "[backup] uploading s3://${BACKUP_S3_BUCKET}/${S3_KEY} (SSE-KMS)"
aws s3 cp "${LOCAL_PATH}" "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" \
  --sse aws:kms \
  --sse-kms-key-id "${BACKUP_S3_KMS_KEY_ID}" \
  --metadata "tool=pg_dump,db=${POSTGRES_DB},pg_version=16"

rm -f "${LOCAL_PATH}"
echo "[backup] done"
