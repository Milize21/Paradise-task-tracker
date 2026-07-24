#!/usr/bin/env bash
# Deploy manual di server: tarik image hasil CI dari GHCR lalu restart.
# Server tidak pernah build sendiri — image dibangun oleh workflow paradise-build.
#
#   ./paradise/bin/deploy.sh                       # rilis terbaru (tag latest)
#   APP_RELEASE=<git-sha> ./paradise/bin/deploy.sh # pin / rollback ke commit tertentu
#
# Exit != 0 kalau healthcheck gagal, jadi aman dipanggil dari cron kalau nanti
# mau diotomatiskan.
set -euo pipefail

cd "$(dirname "$0")/../.."
compose=(docker compose -f docker-compose.yml -f docker-compose.ghcr.yml)

git pull --ff-only
"${compose[@]}" pull
"${compose[@]}" up -d
exec paradise/bin/healthcheck.sh
