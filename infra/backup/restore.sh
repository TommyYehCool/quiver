#!/bin/sh
# phase 6E-5: 從 S3 拉回 backup 並 restore 到指定 DB
#
# 用途:
# - 災難復原時還原 production
# - 每週 restore drill(還原到測試環境驗證 backup 真的能用)
#
# 用法:
#   restore.sh <s3-key> <target-db>
#   e.g. restore.sh quiver/2026/04/quiver-20260430T030000Z.dump quiver_drill
#
# 環境變數同 pg_dump.sh,target db 必須先存在(空的就好)

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <s3-key> <target-db>" >&2
  exit 2
fi

S3_KEY="$1"
TARGET_DB="$2"

: "${POSTGRES_HOST:?POSTGRES_HOST required}"
: "${POSTGRES_USER:?POSTGRES_USER required}"
: "${PGPASSWORD:?PGPASSWORD required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET required}"

LOCAL_PATH="/tmp/restore.dump"

echo "[restore] downloading s3://${BACKUP_S3_BUCKET}/${S3_KEY}"
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" "${LOCAL_PATH}"

echo "[restore] running pg_restore into ${TARGET_DB}"
pg_restore \
  --host="${POSTGRES_HOST}" \
  --username="${POSTGRES_USER}" \
  --dbname="${TARGET_DB}" \
  --no-owner \
  --no-privileges \
  --jobs=4 \
  --verbose \
  "${LOCAL_PATH}"

rm -f "${LOCAL_PATH}"
echo "[restore] done"
