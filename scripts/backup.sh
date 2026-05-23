#!/usr/bin/env bash
# Daily PostgreSQL backup script — place in /etc/cron.daily/ or run via cron.
# Usage: ./backup.sh
# Requires: pg_dump, gzip, AWS CLI (optional for S3 upload)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/cafeteria}"
DB_NAME="${DB_NAME:-cafeteria}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/cafeteria_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup of $DB_NAME..."

PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  | gzip > "$FILE"

echo "[$(date)] Backup written to $FILE ($(du -sh "$FILE" | cut -f1))"

# Remove backups older than RETAIN_DAYS
find "$BACKUP_DIR" -name "cafeteria_*.sql.gz" -mtime +"$RETAIN_DAYS" -delete
echo "[$(date)] Old backups pruned (kept last $RETAIN_DAYS days)"

# Optional: upload to S3
if [ -n "${S3_BUCKET:-}" ]; then
  aws s3 cp "$FILE" "s3://$S3_BUCKET/backups/$(basename "$FILE")" --quiet
  echo "[$(date)] Uploaded to s3://$S3_BUCKET/backups/"
fi

echo "[$(date)] Backup complete."
