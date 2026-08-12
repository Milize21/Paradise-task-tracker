#!/usr/bin/env bash
# Healthcheck cepat Paradise Task Tracker. Exit != 0 kalau ada yang tidak sehat
# (biar bisa dipakai di cron/monitoring).
set -uo pipefail

cd "$(dirname "$0")/../.."   # -> root repo

# Alamat yang diperiksa diambil dari .env, yaitu alamat yang SAMA dengan yang
# diberikan aplikasi kepada penggunanya. Sebelumnya di sini ada
# `http://localhost` sebagai bawaan, dan sejak HTTPS menyala itu memeriksa hal
# yang salah: Caddy mengalihkannya ke `https://localhost`, nama host yang tidak
# punya sertifikat, sehingga jabat tangan TLS ditolak dan hasilnya tidak pernah
# 200 sekalipun aplikasinya sehat sempurna.
#
# Memeriksa alamat sungguhan juga membuat healthcheck ini ikut menguji
# sertifikat dan pengalihannya, bukan cuma apakah container hidup.
if [ -z "${WEB_URL:-}" ] && [ -f .env ]; then
  WEB_URL="$(grep -m1 '^WEB_URL=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
WEB_URL="${WEB_URL:-http://localhost}"
fail=0

echo "== Container status =="
docker compose ps || fail=1

# Container yang restart-loop / exited dianggap tidak sehat
bad="$(docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep -viE 'running|up' || true)"
if [ -n "$bad" ]; then echo "TIDAK SEHAT:"; echo "$bad"; fail=1; fi

echo "== HTTP $WEB_URL =="
# curl sudah mencetak 000 sendiri saat koneksi gagal; `|| echo 000` yang dulu
# ada di sini menambah satu lagi sehingga log berbunyi "HTTP 000000".
# -L mengikuti pengalihan, supaya memeriksa alamat http:// juga tetap sampai ke
# hasil akhirnya. Batas waktu 15 detik karena kini ada jabat tangan TLS.
code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 15 "$WEB_URL" || true)"
echo "HTTP $code"
# 308 SENGAJA TIDAK diterima. Ia berarti pengalihannya tidak sampai tujuan, dan
# menerimanya membuat healthcheck lulus justru saat rantai HTTPS-nya patah.
[ "$code" = "200" ] || [ "$code" = "302" ] || fail=1

[ "$fail" = "0" ] && echo "== SEHAT ==" || echo "== ADA MASALAH =="
exit "$fail"
