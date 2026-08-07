#!/usr/bin/env bash
# Ringkasan kondisi server Paradise Task Tracker dalam satu layar.
# Baca-saja, aman dijalankan kapan pun:  ./paradise/bin/status.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

C=(docker compose -f docker-compose.yml -f docker-compose.ghcr.yml)
[ -f docker-compose.ghcr.yml ] || C=(docker compose -f docker-compose-local.yml)
WEB_URL="${WEB_URL:-http://localhost}"
bar() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

bar "MESIN"
printf 'Waktu    : %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
printf 'Nyala    : %s\n' "$(uptime -p 2>/dev/null || echo '-')"
printf 'Beban    : %s  (%s vCPU)\n' \
  "$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || echo '-')" "$(nproc 2>/dev/null || echo '?')"

bar "RAM"
if command -v free >/dev/null 2>&1; then
  free -h | awk 'NR==2{printf "Memori   : %s dipakai dari %s, tersedia %s\n",$3,$2,$7}
                 NR==3{printf "Swap     : %s dipakai dari %s\n",$3,$2}'
else
  echo "  (perintah 'free' tidak ada - normal di Git Bash Windows, ada di Linux)"
fi

bar "DISK"
df -h / 2>/dev/null | awk 'NR==2 && $2 ~ /[0-9]/{printf "Root     : %s dipakai dari %s (%s), sisa %s\n",$3,$2,$5,$4}'
docker system df 2>/dev/null | sed 's/^/  /'

bar "CONTAINER"
"${C[@]}" ps -a --format "table {{.Service}}\t{{.State}}\t{{.Status}}" 2>/dev/null
bad="$("${C[@]}" ps -a --format '{{.Service}} {{.State}}' 2>/dev/null | grep -viE 'running|exited' || true)"
[ -n "$bad" ] && printf '\nPERLU DILIHAT:\n%s\n' "$bad"

bar "PEMAKAIAN PER CONTAINER"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | head -20

bar "HTTP"
for p in / /api/instances/ /god-mode/ /spaces/ /live/health; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${WEB_URL}${p}")"
  case "$code" in 200|302) m="OK" ;; *) m="<-- PERIKSA" ;; esac
  printf '  %-18s %s %s\n' "$p" "$code" "$m"
done

bar "BACKUP"
if [ -d backups ] && [ -n "$(ls -A backups 2>/dev/null)" ]; then
  printf 'Jumlah   : %s berkas, total %s\n' \
    "$(ls backups | wc -l)" "$(du -sh backups | cut -f1)"
  printf 'Terbaru  :\n'; ls -lht backups | sed -n '2,4p' | awk '{printf "  %s  %s %s %s\n",$5,$6,$7,$9}'
else
  printf 'BELUM ADA BACKUP di ./backups\n'
fi

bar "VERSI TERPASANG"
docker ps --format '{{.Image}}' 2>/dev/null | grep -o 'plane-[a-z]*:[^ ]*' | sort -u | sed 's/^/  /'
printf '  commit repo   : %s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo '-')"
# Tertinggal dari origin = image di GHCR mungkin lebih baru dari yang jalan.
if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  git fetch -q origin 2>/dev/null || true
  belakang="$(git rev-list --count HEAD..@{u} 2>/dev/null || echo '?')"
  printf '  tertinggal    : %s commit dari origin%s\n' "$belakang" \
    "$([ "$belakang" != "0" ] && echo '  <-- jalankan deploy.sh' || echo '')"
fi

# ---------------------------------------------------------------- database --
# Semua di bawah butuh container db hidup. Kalau mati, lewati dengan tenang
# daripada memuntahkan galat psql beruntun yang menutupi bagian di atasnya.
psql_t() { "${C[@]}" exec -T plane-db psql -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -t -A "$@" 2>/dev/null; }

if psql_t -c "SELECT 1" >/dev/null 2>&1; then
  bar "MIGRASI"
  printf '  terakhir  : %s\n' "$(psql_t -c "SELECT app||' '||name FROM django_migrations ORDER BY id DESC LIMIT 1;")"
  tertinggal="$("${C[@]}" exec -T api python manage.py showmigrations --plan 2>/dev/null | grep -c '^\[ \]')"
  printf '  belum jalan: %s%s\n' "${tertinggal:-?}" \
    "$([ "${tertinggal:-0}" != "0" ] && echo '  <-- ada migrasi tertunda' || echo '')"

  bar "ISI SISTEM"
  psql_t -F' : ' -c "
    SELECT 'user aktif', count(*) FROM users WHERE is_active AND NOT is_bot
    UNION ALL SELECT 'project', count(*) FROM projects WHERE deleted_at IS NULL
    UNION ALL SELECT 'work item', count(*) FROM issues WHERE deleted_at IS NULL
    UNION ALL SELECT 'halaman wiki', count(*) FROM pages WHERE deleted_at IS NULL
    UNION ALL SELECT 'lampiran', count(*) FROM file_assets WHERE is_uploaded
    UNION ALL SELECT 'instance admin', count(*) FROM instance_admins WHERE deleted_at IS NULL;" | sed 's/^/  /'

  bar "SESI & AKTIVITAS"
  printf '  sesi hidup     : %s\n' "$(psql_t -c "SELECT count(*) FROM sessions WHERE expire_date > now();")"
  printf '  riwayat login  : %s peristiwa, tertua %s\n' \
    "$(psql_t -c "SELECT count(*) FROM login_activities;")" \
    "$(psql_t -c "SELECT COALESCE(to_char(min(terjadi_pada),'DD Mon YYYY'),'-') FROM login_activities;")"
  printf '  login 24 jam   : %s\n' \
    "$(psql_t -c "SELECT count(*) FROM login_activities WHERE jenis='LOGIN' AND terjadi_pada > now() - interval '24 hours';")"

  bar "EMAIL"
  psql_t -F' : ' -c "
    SELECT key, CASE WHEN is_encrypted THEN '<terenkripsi>'
                     WHEN value IS NULL OR value='' THEN '<kosong>'
                     ELSE value END
    FROM instance_configurations
    WHERE key IN ('ENABLE_SMTP','EMAIL_HOST','EMAIL_PORT','EMAIL_HOST_USER','EMAIL_FROM',
                  'EMAIL_USE_SSL','EMAIL_USE_TLS','IMAP_HOST','IMAP_PORT')
    ORDER BY key;" | sed 's/^/  /'
  echo "  (IMAP tersimpan tapi belum dibaca fitur apa pun - disengaja)"
fi

# ------------------------------------------------------------------ celery --
bar "TASK TERJADWAL"
terdaftar="$("${C[@]}" exec -T worker celery -A plane inspect registered 2>/dev/null)"
for t in login_activity_retention recurring_issue_task deletion_task; do
  printf '  %-26s %s\n' "$t" \
    "$(echo "$terdaftar" | grep -q "$t" && echo 'terdaftar di worker' || echo 'TIDAK TERDAFTAR')"
done
echo "  (beat saja tidak cukup - task tak terdaftar dibuang diam-diam)"

# ---------------------------------------------------------------- keamanan --
bar "PEMERIKSAAN CEPAT"
for f in .env apps/api/.env; do
  [ -f "$f" ] || { printf '  %-16s TIDAK ADA\n' "$f"; continue; }
  lemah="$(grep -cE '^(POSTGRES_PASSWORD|RABBITMQ_PASSWORD|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)="?(plane|access-key|secret-key)"?$' "$f")"
  printf '  %-16s %s\n' "$f" \
    "$([ "$lemah" = "0" ] && echo 'secret bukan nilai contoh' || echo "$lemah SECRET MASIH NILAI CONTOH")"
done
printf '  port terekspos  : %s\n' \
  "$(docker ps --format '{{.Ports}}' 2>/dev/null | grep -oE '0\.0\.0\.0:[0-9]+' | sort -u | tr '\n' ' ')"
[ -f /var/run/reboot-required ] && printf '  reboot          : TERTUNDA (kernel baru terpasang)\n' \
                                || printf '  reboot          : tidak perlu\n'
echo
