# NOTICE — Paradise Task Tracker

**Paradise Task Tracker** adalah deployment internal kantor berbasis **Plane
Community Edition**.

- **Upstream:** https://github.com/makeplane/plane
- **Lisensi:** GNU AGPL-3.0 (lihat `LICENSE.txt` — tidak dimodifikasi)
- **Hak cipta kode aplikasi:** © Plane (makeplane) dan kontributornya.

## Yang ditambahkan oleh fork ini

Fork ini **tidak menulis ulang aplikasi Plane**. Yang ditambahkan hanya lapisan
tipis untuk operasional internal kantor:

- Konfigurasi & template environment untuk deployment kantor (`paradise/`)
- Dokumentasi deploy, keamanan, dan upgrade
- Script bantu (dev up, backup DB, healthcheck) di `paradise/bin/`
- Rebrand nama aplikasi menjadi "Paradise Task Tracker"

## Kewajiban AGPL-3.0

Karena AGPL-3.0, bila layanan ini diakses lewat jaringan oleh pengguna, source
code (termasuk modifikasi) **wajib tetap tersedia** untuk mereka. Jangan hapus
`LICENSE.txt` maupun berkas ini.

## Library pihak ketiga yang ditambahkan fork ini

Fitur tambahan kantor memakai library open-source berikut. Hak cipta dan lisensi
milik penulis masing-masing; teks lisensinya ikut terdistribusi via paket
(`pip`) dan tidak boleh dihapus.

| Library                                                        | Fitur                            | Lisensi |
| -------------------------------------------------------------- | -------------------------------- | ------- |
| [django-auditlog](https://github.com/jazzband/django-auditlog) | Jejak audit (siapa mengubah apa) | MIT     |
