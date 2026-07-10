# Deployment Produksi — Paradise Task Tracker

Target: satu server kantor (Linux) melayani ~100 user. **Tidak butuh Kubernetes** —
Docker Compose sudah cukup. K8s hanya perlu kalau butuh HA/autoscale + tim ops.

## Prasyarat server

- Docker Engine + Compose plugin
- 4 vCPU / 8 GB RAM minimum (naik kalau editor kolaboratif ramai)
- Disk cukup untuk Postgres + upload MinIO + backup
- Domain atau IP LAN statis untuk `APP_DOMAIN`

## Langkah

1. **Clone repo ini** ke server, checkout branch `main`.
2. **Konfigurasi env:** `cp paradise/.env.example .env` lalu isi semua `<GANTI>`.
   Jalankan [`SECURITY-CHECKLIST.md`](SECURITY-CHECKLIST.md) — jangan skip.
3. **Pilih compose:**
   - Build dari source (kode kustom kantor):
     `docker compose -f docker-compose.yml up -d --build`
   - Atau image prebuilt (lihat `deployments/cli/community/`, punya knob `*_REPLICAS`).
4. **Migrasi & verifikasi:** container `api` menjalankan migrasi saat start.
   Cek dengan `paradise/bin/healthcheck.sh`.
5. **HTTPS:** set `SITE_ADDRESS=domain-kamu` + `CERT_EMAIL` → Caddy urus sertifikat
   otomatis. Untuk LAN tanpa domain, tetap HTTP di port 80.

## Scaling ~100 user

Naikkan replika worker/web sesuai beban (env `*_REPLICAS` pada compose community),
dan pindahkan Postgres ke volume/disk cepat. Aktifkan read-replica hanya kalau
query berat mulai terasa.

## Backup & pemulihan

Jadwalkan `paradise/bin/backup-db.sh` via cron harian. Simpan juga isi bucket
MinIO. Uji restore secara berkala — backup yang tak pernah diuji = bukan backup.
