# phase 6E-5: pg_dump → S3 backup container
FROM postgres:16-alpine

RUN apk add --no-cache aws-cli bash coreutils

COPY pg_dump.sh /usr/local/bin/pg_dump_to_s3.sh
RUN chmod +x /usr/local/bin/pg_dump_to_s3.sh

# 預設只跑一次然後退出。生產環境用 cron / k8s CronJob 排程觸發。
CMD ["/usr/local/bin/pg_dump_to_s3.sh"]
