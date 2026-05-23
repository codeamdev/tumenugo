#!/usr/bin/env bash
# Restore a backup created by backup.sh
# Usage: ./restore.sh /var/backups/cafeteria/cafeteria_20260101_030000.sql.gz

set -euo pipefail

FILE="${1:?Usage: $0 <backup_file.sql.gz>}"
DB_NAME="${DB_NAME:-cafeteria}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"

if [ ! -f "$FILE" ]; then
  echo "Error: file not found: $FILE"
  exit 1
fi

echo "WARNING: This will DROP and recreate the '$DB_NAME' database."
read -rp "Type 'yes' to confirm: " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 0; }

echo "[$(date)] Dropping and recreating database..."
PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $DB_NAME;"
PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"

echo "[$(date)] Restoring from $FILE..."
gunzip -c "$FILE" | PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -q

echo "[$(date)] Restore complete."
