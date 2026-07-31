# Paradise Task Tracker

Sistem manajemen kerja internal **PT Paradise Perkasa** — pelacakan work item,
pencatatan waktu kerja, dokumentasi perusahaan, dan pelaporan per divisi, jalan
di server sendiri tanpa langganan pihak ketiga.

Dipakai lintas **16 divisi** dengan **79 akun karyawan** dalam satu workspace.

---

## Yang dibangun sendiri

Fondasi aplikasinya open-source (lihat [Asal-usul](#asal-usul)), tapi delapan
kemampuan di bawah ini **tidak ada di dalamnya** dan dibangun dari nol — model
database, migrasi, endpoint API, aturan izin, sampai antarmukanya.

### 🕒 Time Tracking

Model `IssueWorkLog` + API `/work-logs/`. Anggota mencatat dan menghapus worklog
miliknya sendiri; admin project melihat dan mengelola semuanya. Terpasang
langsung di sidebar detail work item.

### 🏷️ Work Item Types & Custom Properties

Tipe work item per project (khusus admin), plus properti kustom dengan **6 jenis
field**: teks, desimal, boolean, tanggal-waktu, pilihan, dan anggota. Model
`IssueProperty` / `IssuePropertyOption` / `IssuePropertyValue`, dengan validasi
nilai bertipe di sisi server — opsi harus milik propertinya, anggota harus
benar-benar anggota project.

### 📋 Templates & Recurring Issues

Template work item yang bisa diterapkan anggota, plus penjadwalan berulang lewat
Celery beat. `advance_schedule()` **melewati jadwal yang terlewat** alih-alih
merapelnya — laptop mati semalam tidak menghasilkan tumpukan tugas palsu esok
paginya.

### 📚 Workspace Wiki — tiga fase

Dokumentasi perusahaan sebagai project khusus, dibangun bertahap:

| Fase  | Isi                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | Halaman menerima **semua tipe berkas** (pdf, docx, mp4, zip) s/d 100 MB, plus node "File" di editor dengan pratinjau PDF di dalam halaman         |
| **B** | **Kontrol edit per-folder** — tiap folder tingkat atas dimiliki satu atau lebih divisi; hanya anggotanya yang boleh menyunting, sisanya baca-saja |
| **C** | **Pohon halaman bertingkat** — sub-halaman terlihat dan bisa dibuka (sebelumnya 404)                                                              |

Fase B ditegakkan di **dua lapis**: REST API dan server kolaborasi real-time.
Endpoint `can-edit/` sengaja **tidak menyalin** aturan izin — ia memanggil kelas
permission yang sama lewat request tiruan, jadi REST dan editor kolaboratif
mustahil berbeda pendapat.

### 📊 Dashboard Divisi

Rekap per project yang diikuti user: total / terbuka / lewat tenggat / selesai,
menit worklog total dan bulan berjalan, jumlah anggota. Plus **ekspor CSV**
laporan waktu (BOM UTF-8, siap dibuka Excel). Isolasi teruji: staf hanya melihat
project yang ia ikuti.

### 🎯 Initiatives

Sasaran tingkat workspace yang menaut beberapa project divisi, dengan rollup
progres dihitung dari seluruh work item di project tertaut.

### 📜 Audit Logs

Perekaman siapa-mengubah-apa pada model akses dan konten (Project, ProjectMember,
WorkspaceMember, Issue, Page). Aktor terekam pada jalur HTTP nyata **maupun**
lewat editor kolaboratif. API baca khusus admin dengan filter model / aksi /
aktor dan pagination.

### 🔐 Kontrol akses per folder Wiki

Pemetaan folder → divisi, dengan pewarisan ke sub-halaman dan override admin.
Dibangun tanpa dependency baru: keanggotaan divisi bersifat dinamis, jadi grant
statis justru rawan melenceng dari keadaan sebenarnya.

---

## Operasional

Bukan cuma fitur — sisi operasionalnya juga dibangun sendiri:

- **CI/CD** — tiap push ke `main` membangun 6 image ke GHCR lewat
  `docker buildx bake`; tag = commit SHA, lalu `latest` digeser dengan
  `imagetools create` (salin manifest, bukan build ulang). Deploy manual di
  server lewat `paradise/bin/deploy.sh`, rollback dengan `APP_RELEASE=<sha>`.
- **Backup** — `paradise/bin/backup-db.sh`: `pg_dump` terkompresi dengan
  retensi, verifikasi hasil tidak kosong, dan menunggu Postgres benar-benar
  siap (`pg_isready`) alih-alih menyerah saat Docker belum naik.
- **Healthcheck** — `paradise/bin/healthcheck.sh` untuk seluruh layanan.
- **Penjadwalan** — `paradise/bin/register-schedule.ps1` (Windows Task
  Scheduler, tanpa perlu hak admin).

---

## Menjalankan

**Prasyarat:** Docker, Node 20+, pnpm.

```bash
cp .env.example .env
cp .env.example apps/api/.env

# backend + infrastruktur
COMPOSE_FILE=docker-compose-local.yml docker compose up -d

# frontend
pnpm install
pnpm dev
```

| Layanan                | Port     |
| ---------------------- | -------- |
| Web                    | **4000** |
| Admin / God Mode       | 3001     |
| Space (halaman publik) | 3002     |
| Live (kolaborasi)      | 3100     |
| API                    | 8000     |

> Ubah kode backend → `docker compose restart api`.
> Ubah `.env` → `docker compose up -d`, **bukan** `restart` — `restart` tidak
> membaca ulang `env_file`.

Panduan deploy produksi, keamanan pra-produksi, dan sinkronisasi upstream ada di
`paradise/`.

---

## Stack

Django REST Framework · PostgreSQL · Redis · RabbitMQ + Celery · MinIO ·
React + React Router · TypeScript · MobX · Tailwind · Hocuspocus (Y.js) ·
Docker Compose · Caddy

---

## Asal-usul

Dibangun di atas **Plane Community Edition v0.24.0**, dilisensikan
**GNU AGPL-3.0**. Rincian atribusi dan kewajiban lisensinya ada di
**[NOTICE.md](NOTICE.md)** dan **[LICENSE.txt](LICENSE.txt)**.

Merek produk upstream sudah dihapus dari antarmuka — sistem ini bukan produk
vendor dan tidak dijual. Yang tetap dipertahankan adalah **atribusi hukum**:
header hak cipta di berkas sumber, teks lisensi, dan berkas NOTICE. AGPL §13
berlaku untuk pemakaian lewat jaringan, terlepas dijual atau tidak.

---

## Lisensi

GNU Affero General Public License v3.0 — lihat [LICENSE.txt](LICENSE.txt).
