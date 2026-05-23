#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# backup-docker.sh — Backup PostgreSQL vía Docker
#
# Uso:
#   bash scripts/backup-docker.sh
#
# Cron diario (2 AM): 0 2 * * * /opt/cafeteria/scripts/backup-docker.sh
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/cafeteria}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cafeteria}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/cafeteria_${TIMESTAMP}.sql.gz"
ENV_FILE="$APP_DIR/.env.production"

mkdir -p "$BACKUP_DIR"

# Leer DB_USER del .env.production
DB_USER=$(grep '^DB_USER=' "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
DB_USER="${DB_USER:-cafeteria_app}"

echo "[$(date)] Iniciando backup de cafeteria (usuario: $DB_USER)..."

cd "$APP_DIR"
docker compose --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" -d cafeteria --no-owner --no-acl \
  | gzip > "$FILE"

SIZE=$(du -sh "$FILE" | cut -f1)
echo "[$(date)] Backup guardado: $FILE ($SIZE)"

# Eliminar backups más antiguos de RETAIN_DAYS días
find "$BACKUP_DIR" -name "cafeteria_*.sql.gz" -mtime +"$RETAIN_DAYS" -delete
echo "[$(date)] Backups antiguos purgados (retención: $RETAIN_DAYS días)"

# Upload opcional a S3
if [ -n "${S3_BUCKET:-}" ]; then
  aws s3 cp "$FILE" "s3://$S3_BUCKET/backups/$(basename "$FILE")" --quiet
  echo "[$(date)] Subido a s3://$S3_BUCKET/backups/"
fi

echo "[$(date)] Backup completo."
