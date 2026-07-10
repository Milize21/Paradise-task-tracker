#!/usr/bin/env bash
# Backup PostgreSQL Paradise Task Tracker via pg_dump di container.
# Cron harian:  0 2 * * *  /path/repo/paradise/bin/backup-db.sh
set -euo pipefail

cd "$(dirname "$0")/../.."   # -> root repo
[ -f .env ] && set -a && . ./.env && set +a

DB_SERVICE="${DB_SERVICE:-plane-db}"          # nama service postgres di compose
OUT_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"

CID="$(docker compose ps -q "$DB_SERVICE" || true)"
[ -n "$CID" ] || { echo "ERROR: container '$DB_SERVICE' tidak jalan"; exit 1; }

FILE="$OUT_DIR/paradise-${POSTGRES_DB:-plane}-${STAMP}.sql.gz"
echo "Dumping -> $FILE"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$CID" \
  pg_dump -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" | gzip > "$FILE"

# Verifikasi hasil tidak kosong (backup rusak = lebih bahaya dari tidak ada)
[ -s "$FILE" ] || { echo "ERROR: backup kosong, hapus."; rm -f "$FILE"; exit 1; }

find "$OUT_DIR" -name 'paradise-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "OK ($(du -h "$FILE" | cut -f1)). Retensi ${RETENTION_DAYS} hari."
