#!/usr/bin/env bash
# Healthcheck cepat Paradise Task Tracker. Exit != 0 kalau ada yang tidak sehat
# (biar bisa dipakai di cron/monitoring).
set -uo pipefail

cd "$(dirname "$0")/../.."   # -> root repo
WEB_URL="${WEB_URL:-http://localhost}"
fail=0

echo "== Container status =="
docker compose ps || fail=1

# Container yang restart-loop / exited dianggap tidak sehat
bad="$(docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep -viE 'running|up' || true)"
if [ -n "$bad" ]; then echo "TIDAK SEHAT:"; echo "$bad"; fail=1; fi

echo "== HTTP $WEB_URL =="
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$WEB_URL" || echo 000)"
echo "HTTP $code"
[ "$code" = "200" ] || [ "$code" = "302" ] || fail=1

[ "$fail" = "0" ] && echo "== SEHAT ==" || echo "== ADA MASALAH =="
exit "$fail"
