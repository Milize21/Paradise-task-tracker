# Paradise Task Tracker

Sistem manajemen kerja internal PT Paradise Perkasa. Jalan di server sendiri,
tanpa langganan bulanan ke siapa pun.

Sekarang dipakai 16 divisi, 79 akun.

## Kenapa dibikin

Kantor butuh satu tempat buat ngelacak kerjaan, catat jam kerja, dan naruh
dokumentasi perusahaan. Yang komersial mahal kalau dikali 79 orang, dan datanya
ada di server orang lain.

Jadi saya ambil basis open-source yang bagus (Plane CE, AGPL, lihat bagian
paling bawah), lalu bangun sendiri bagian-bagian yang kantor butuh tapi memang
nggak ada di dalamnya.

## Yang saya bangun sendiri

Delapan ini nggak ada di basis aslinya. Semuanya dari nol, model database,
migrasi, endpoint, aturan izin, sampai tampilannya.

**Time tracking.** Orang catat jam kerja langsung di work item-nya. Tiap orang
cuma bisa hapus catatan miliknya sendiri, admin project bisa lihat semua.

**Work item types + custom properties.** Tiap project bisa punya tipe work item
sendiri, dan properti custom dengan 6 jenis field (teks, angka, boolean,
tanggal, pilihan, anggota). Validasinya di server, opsi harus beneran milik
propertinya, dan kalau field-nya "anggota" ya orangnya harus beneran anggota
project itu.

**Template + recurring.** Bikin template work item, terus jadwalkan berulang.
Yang agak saya pikirin di sini: kalau laptop mati semalam, jadwal yang kelewat
**dilewat**, bukan dirapel. Kalau dirapel, paginya orang bangun dan dapat
tumpukan tugas palsu.

**Wiki perusahaan.** Ini yang paling panjang, dikerjain tiga tahap:

Tahap A, halaman bisa nerima semua tipe file, pdf, docx, mp4, zip, sampai
100 MB, plus node "File" di editor yang bisa nampilin PDF langsung di dalam
halaman.

Tahap B, kontrol edit per folder. Tiap folder tingkat atas dimiliki divisi
tertentu; cuma anggotanya yang boleh nyunting, sisanya baca doang. Ini yang
paling makan waktu, karena harus ditegakkan di **dua tempat**: REST API dan
server kolaborasi real-time. Kalau cuma di REST, orang di luar divisi bakal
lihat halamannya bisa diedit, ngetik panjang-panjang, terus tulisannya hilang
pas reload. Endpoint `can-edit/` sengaja nggak nyalin aturan izinnya, dia
manggil kelas permission yang sama persis, jadi REST sama editor mustahil beda
pendapat.

Tahap C, pohon halaman bertingkat. Sub-halaman dulu bukan cuma nggak keliatan,
tapi **404 kalau dibuka**.

**Dashboard divisi.** Rekap per project yang kamu ikuti: total, yang masih
jalan, yang lewat tenggat, yang selesai, plus total jam kerja. Ada ekspor CSV
juga, langsung bisa dibuka Excel. Staf cuma lihat project yang dia ikuti.

**Initiatives.** Sasaran tingkat workspace yang nyambungin beberapa project
divisi, progresnya dihitung dari semua work item di project yang ketaut.

**Audit logs.** Nyatet siapa ngubah apa di model-model penting. Aktornya
kerekam baik lewat request HTTP biasa maupun lewat editor kolaboratif, yang
kedua ini sempat saya ragukan, ternyata jalan.

**ACL per folder Wiki.** Pemetaan folder ke divisi, sub-halaman mewarisi dari
induknya, admin bisa override. Sengaja nggak nambah dependency: keanggotaan
divisi itu berubah-ubah, jadi grant statis malah gampang melenceng dari
kenyataan.

## Bagian operasionalnya

Ini juga saya urus sendiri, dan jujur bagian ini yang paling sering ngasih
pelajaran:

- **CI/CD**, tiap push ke `main` bikin 6 image ke GHCR. Tag-nya pakai commit
  SHA, terus `latest` digeser pakai `imagetools create` (nyalin manifest, bukan
  build ulang). Deploy di server manual lewat `paradise/bin/deploy.sh`, rollback
  tinggal `APP_RELEASE=<sha>`.
- **Backup**, `pg_dump` terkompresi, ada retensi, hasilnya dicek nggak kosong.
  Dan dia **nunggu** Postgres beneran siap, bukan langsung nyerah pas Docker
  belum naik. Ini hasil dua pagi berturut-turut backup gagal.
- **Healthcheck** buat semua layanan, plus skrip pendaftaran scheduled task yang
  nggak butuh hak admin di Windows.

## Cara jalanin

Butuh Docker, Node 20+, pnpm.

```bash
cp .env.example .env
cp .env.example apps/api/.env

COMPOSE_FILE=docker-compose-local.yml docker compose up -d
pnpm install
pnpm dev
```

Web-nya di **port 4000** (bukan 3000, ini sering bikin salah). Admin/God Mode
3001, halaman publik 3002, server kolaborasi 3100, API 8000.

Dua hal yang bakal bikin kamu bingung kalau nggak tahu:

- Ubah kode backend? **`docker compose restart api`.** Autoreload-nya nggak
  jalan di sini, bind-mount Windows ke container nggak nerusin event perubahan
  file. Gejalanya endpoint balas 404 padahal kodenya udah bener.
- Ubah `.env`? **`docker compose up -d`, bukan `restart`.** `restart` nggak baca
  ulang `env_file`.

Sisanya, deploy produksi, checklist keamanan, cara sync dari upstream, ada di
folder `paradise/`.

## Dibangun pakai

Django REST Framework, PostgreSQL, Redis, RabbitMQ + Celery, MinIO di backend.
React + React Router, TypeScript, MobX, Tailwind di frontend. Hocuspocus (Y.js)
buat editor kolaboratif. Semuanya dibungkus Docker Compose, di depannya Caddy.

## Yang belum beres

Biar jujur aja:

- **SMTP belum jalan.** Kolomnya udah keisi, tapi host-nya masih placeholder yang
  nggak resolve dari dalam container. Jadi undangan user sama reset password
  nggak bakal nyampe. Nunggu IP mail server dari IT.
- **Belum ada server produksi.** Masih jalan lokal semua.
- **Isi Wiki-nya masih kerangka.** Mesinnya udah kelar, dokumennya belum ditulis
  , dan itu kerjaan manusia, bukan kerjaan kode.
- **Belum pernah sync dari upstream.** Berisiko konflik, nanti dikerjain di
  branch sendiri.

## Soal basis kodenya

Ini dibangun di atas **Plane Community Edition v0.24.0**, lisensinya
**GNU AGPL-3.0**. Detail atribusi sama kewajiban lisensinya ada di
[NOTICE.md](NOTICE.md) dan [LICENSE.txt](LICENSE.txt).

Merek produk aslinya udah saya hapus dari tampilan, sistem ini bukan produk
vendor dan nggak dijual, jadi nampilin merek orang lain di dalamnya cuma bikin
bingung. Tapi **atribusi hukumnya tetap**: header copyright di file sumber, teks
lisensi, dan file NOTICE. Dua hal itu beda, dan yang kedua bukan hak saya buat
hapus.

Kalau kamu pakai ini lewat jaringan, AGPL pasal 13 tetap berlaku, mau dijual
atau enggak.

## Lisensi

GNU Affero General Public License v3.0. Lihat [LICENSE.txt](LICENSE.txt).
