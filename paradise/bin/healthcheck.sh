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
# curl sudah mencetak 000 sendiri saat koneksi gagal; `|| echo 000` yang dulu
# ada di sini menambah satu lagi sehingga log berbunyi "HTTP 000000".
# -L: ikuti pengalihan. Sejak HTTPS menyala, `http://localhost` menjawab 308 ke
# https://space.paradiseperkasa.com, jadi tanpa ini healthcheck berteriak "ADA
# MASALAH" pada setiap deploy yang justru berhasil. Sudah terjadi dua kali pada
# 12 Agt 2026, dan alarm yang berbunyi saat semuanya baik adalah cara tercepat
# melatih orang mengabaikan alarm.
#
# Yang diperiksa jadi hasil AKHIR rantai pengalihan, dan itu memang yang ingin
# kita ketahui: apakah orang yang mengetik alamatnya sampai ke aplikasi.
code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 15 "$WEB_URL" || true)"
echo "HTTP $code"
# 308 tetap diterima untuk jaga-jaga kalau -L gagal mengikuti (misalnya
# sertifikat belum terbit di menit-menit pertama setelah domain diganti).
case "$code" in
  200 | 302 | 308) ;;
  *) fail=1 ;;
esac

[ "$fail" = "0" ] && echo "== SEHAT ==" || echo "== ADA MASALAH =="
exit "$fail"
