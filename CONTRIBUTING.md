# Panduan Kerja, Paradise Task Tracker

Repositori internal PT Paradise Perkasa. Panduan ini untuk siapa pun yang
mengerjakan kodenya.

---

## Menyiapkan lingkungan

**Prasyarat:** Docker · Node 20+ · pnpm · RAM 12 GB (8 GB sering gagal saat
build container).

```bash
git clone https://github.com/Milize21/Paradise-task-tracker.git
cd Paradise-task-tracker

cp .env.example .env
cp .env.example apps/api/.env

COMPOSE_FILE=docker-compose-local.yml docker compose up -d
pnpm install
pnpm dev
```

Buka `http://localhost:3001/god-mode/` untuk mendaftarkan instance admin pertama.

| Layanan          | Port                  |
| ---------------- | --------------------- |
| Web              | **4000** (bukan 3000) |
| Admin / God Mode | 3001                  |
| Space            | 3002                  |
| Live             | 3100                  |
| API              | 8000                  |

---

## Tiga jebakan lingkungan yang WAJIB diingat

Ketiganya sudah pernah memakan waktu berjam-jam. Baca sebelum melapor "kodenya
tidak jalan".

**1. Ubah kode backend → `docker compose restart api`**
`runserver` tidak auto-reload di sini: bind-mount Windows→container tidak
meneruskan event perubahan berkas. Gejalanya endpoint membalas 404 padahal
kodenya sudah benar.

**2. Ubah `.env` → `docker compose up -d`, BUKAN `restart`**
`restart` tidak membaca ulang `env_file`. Container harus dibuat ulang.

**3. Habis commit yang menyentuh berkas locale → cek `git status`**
`packages/i18n/locales` adalah junction ke `packages/i18n/src/locales`. Proses
`git stash` milik pre-commit hook bisa memecahnya menjadi direktori asli berisi
ratusan duplikat. Kalau `git status` tiba-tiba menampilkan ratusan perubahan,
junction-nya pecah, jangan di-commit, pulihkan dulu.

Selain itu: jangan menaruh berkas sementara di `packages/*` atau `apps/live`
saat `pnpm dev` jalan, watcher akan me-rebuild dan me-restart server Live di
tengah pengujian.

---

## Gerbang sebelum commit

Jalankan semuanya. Pre-commit hook menjalankan lint & format atas berkas
ter-stage, tapi tidak menjalankan tsc maupun `sync:check`.

```bash
pnpm --filter web exec tsc --noEmit          # ulangi utk space, admin, constants
pnpm exec oxlint --deny-warnings <path>
pnpm exec oxfmt --check <path>
```

Kalau menyentuh berkas locale, tambahkan:

```bash
pnpm --filter @plane/i18n run sync:check     # wajib 19/19
pnpm --filter @plane/i18n run generate:types
```

Catatan:

- `oxlint <path>` **tanpa** `--deny-warnings` memberi hijau palsu.
- Jangan salurkan hasilnya ke `tail` lalu membaca `$?`, yang terbaca exit code
  `tail`. Tulis ke berkas dulu, atau pakai `${PIPESTATUS[0]}`.
- Peringatan pre-existing di berkas yang kamu sentuh: **perbaiki**, jangan
  dibungkam.

---

## Menambah key i18n

- Nama berkas di `packages/i18n/src/locales/en/` adalah **nama namespace**.
  Key daun tidak boleh memakai nama yang sama, `"wiki"` ditolak karena
  `wiki.json` sudah membentuk namespace `wiki.*`. Bentrok ini tidak terdeteksi
  tsc maupun oxlint, hanya `sync:check`.
- Key di `common.json` bisa dipanggil tanpa awalan (`defaultNS: "common"`).
- Key baru wajib ditambahkan ke **semua 19 locale**, lalu `sync:check` harus
  melaporkan 19/19.

---

## Menambah background task

Daftarkan di **dua tempat**, kalau tidak task-nya tidak akan pernah jalan:

1. `apps/api/plane/celery.py` → `beat_schedule` (kapan dikirim)
2. `apps/api/plane/settings/common.py` → `CELERY_IMPORTS` (agar worker
   mengenalnya)

`autodiscover_tasks()` hanya mencari `tasks.py` per app, sedangkan task di repo
ini ada di `plane/bgtasks/*.py`. Task yang tidak terdaftar akan dikirim beat lalu
**dibuang diam-diam** oleh worker.

Verifikasi:

```bash
docker exec pradise_plane-worker-1 celery -A plane inspect registered
```

---

## Menambah fitur

Cek **`apps/web/ce/`** lebih dulu. Alias `@/plane-web/*` menunjuk ke sana, dan
banyak slot UI sudah ter-wire ke stub kosong, mengisinya jauh lebih murah
daripada membangun jalur baru.

Item navigasi baru harus didaftarkan di **dua** tempat, kalau tidak ia tidak
akan pernah terlihat:

1. daftar item nav (`packages/constants/src/workspace.ts`)
2. `getSidebarNavigationItemIcon` di `apps/web/ce/.../sidebar/helper.tsx`,
   `switch` ini tidak punya `default`, jadi key tak terdaftar tampil tanpa ikon
   tanpa error apa pun

Item nav dinamis juga disembunyikan kalau tidak di-pin. Daftarkan lewat
`additionalStaticItems` agar selalu tampil.

---

## Konvensi commit

```
<tipe>(<cakupan>): <deskripsi singkat, huruf kecil>

Badan pesan menjelaskan KENAPA, bukan cuma apa. Sebutkan perilaku salah yang
diperbaiki, dan sebutkan juga apa yang sengaja TIDAK dikerjakan beserta
alasannya.
```

Tipe: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`.

Tulis apa yang sudah diverifikasi dan bagaimana. "Sudah diuji" tanpa menyebut
caranya tidak berguna buat orang berikutnya, termasuk buat dirimu sendiri
tiga minggu lagi.

---

## Dokumentasi operasional

Panduan deploy, backup, keamanan pra-produksi, dan sinkronisasi upstream ada di
`paradise/`. Skrip operasionalnya di `paradise/bin/`.

Sinkronisasi upstream harus di-diff terhadap **tag `v0.24.0`**, bukan
`upstream/main`, repo ini di-vendor dari v0.24.0, jadi diff ke `main` akan
melaporkan ribuan baris jarak versi sebagai "perubahan kita".

---

## Lisensi

Kontribusi ke repositori ini tunduk pada **GNU AGPL-3.0**
([LICENSE.txt](LICENSE.txt)). Jangan menghapus header hak cipta di berkas
sumber, `LICENSE.txt`, atau [NOTICE.md](NOTICE.md), lihat NOTICE untuk
penjelasan mengapa penghapusan merek produk berbeda dari penghapusan atribusi
hukum.
