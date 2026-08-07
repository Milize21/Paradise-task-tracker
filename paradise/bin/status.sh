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
printf '  commit repo: %s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo '-')"
echo
