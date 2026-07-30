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

# Trigger logon+5m sering menyala sebelum Docker Desktop selesai naik, dan dulu
# script langsung exit 1 -> backup di trigger itu SELALU gagal (terbukti
# 2026-07-30: kedua trigger Result=1). Jadi tunggu, jangan menyerah seketika.
# Syaratnya pg_isready, bukan cuma "container ada": container yang baru Up
# beberapa detik masih menolak koneksi, dan pg_dump-nya akan gagal.
# ponytail: batas 300s cukup untuk Docker Desktop di mesin ini; naikkan lewat
# BACKUP_WAIT_SECS kalau nanti dipindah ke server yang lebih lambat boot.
WAIT_SECS="${BACKUP_WAIT_SECS:-300}"
DEADLINE=$(( $(date +%s) + WAIT_SECS ))
CID=""
while :; do
  CID="$(docker compose ps -q "$DB_SERVICE" 2>/dev/null || true)"
  if [ -n "$CID" ] && docker exec "$CID" pg_isready -U "${POSTGRES_USER:-plane}" -q 2>/dev/null; then
    break
  fi
  [ "$(date +%s)" -lt "$DEADLINE" ] || {
    echo "ERROR: '$DB_SERVICE' tidak siap setelah ${WAIT_SECS}s (Docker Desktop mati?)"
    exit 1
  }
  sleep 10
done

FILE="$OUT_DIR/paradise-${POSTGRES_DB:-plane}-${STAMP}.sql.gz"
echo "Dumping -> $FILE"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$CID" \
  pg_dump -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" | gzip > "$FILE"

# Verifikasi hasil tidak kosong (backup rusak = lebih bahaya dari tidak ada)
[ -s "$FILE" ] || { echo "ERROR: backup kosong, hapus."; rm -f "$FILE"; exit 1; }

find "$OUT_DIR" -name 'paradise-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "OK ($(du -h "$FILE" | cut -f1)). Retensi ${RETENTION_DAYS} hari."
