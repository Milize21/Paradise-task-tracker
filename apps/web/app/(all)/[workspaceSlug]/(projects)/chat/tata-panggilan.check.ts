/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: pemeriksaan tata layar panggilan
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Jalankan DARI packages/i18n, karena tsx hanya terpasang di situ:
 *   pnpm exec tsx "../../apps/web/app/(all)/[workspaceSlug]/(projects)/chat/tata-panggilan.check.ts"
 *
 * Urutan argumen: (status, pakaiVideo, adaStreamLokal, jumlahPeserta)
 *
 * Catatan: aturan "elemen media lawan SELALU terpasang walau hanya audio" tidak
 * lagi diuji di sini karena sekarang dijamin oleh struktur komponen `Peserta`,
 * yang selalu merender `Media` dan hanya menyembunyikannya lewat CSS. Aturan itu
 * pernah dilanggar dan membuat panggilan sunyi total.
 */

import assert from "node:assert/strict";
import { tataPanggilan } from "./tata-panggilan";

// Diam: tidak ada apa pun di layar.
{
  const t = tataPanggilan("diam", true, true, 3);
  assert.equal(t.tampil, false, "status diam tidak boleh menampilkan layar panggilan");
}

// PERNAH SALAH: peserta dianggap ada berdasarkan NIAT memakai video, bukan
// media yang benar-benar tiba. Akibatnya layar menampilkan kotak hitam kosong
// yang terlihat seperti kerusakan padahal panggilannya hidup.
{
  const t = tataPanggilan("tersambung", true, true, 0);
  assert.equal(t.adaPeserta, false, "tersambung tapi belum ada peserta: jangan tampilkan kisi kosong");
  assert.equal(t.tampil, true, "layarnya tetap tampil, cuma isinya belum ada");
}

// Belum tersambung: peserta belum ditampilkan walau datanya sudah ada.
for (const status of ["memanggil", "berdering", "menyambungkan"] as const) {
  const t = tataPanggilan(status, true, true, 2);
  assert.equal(t.adaPeserta, false, `belum tersambung (${status}), peserta belum ditampilkan`);
}

// Satu lawan bicara tampil besar, bukan dipaksa masuk kisi.
{
  const t = tataPanggilan("tersambung", true, true, 1);
  assert.equal(t.adaPeserta, true, "satu peserta sudah cukup untuk menampilkan");
  assert.equal(t.kolom, 1, "panggilan berdua tampil penuh, bukan setengah layar");
}

// Konferensi: kisi tumbuh mengikuti jumlah peserta.
{
  assert.equal(tataPanggilan("tersambung", true, true, 2).kolom, 2, "tiga orang: dua kolom");
  assert.equal(tataPanggilan("tersambung", true, true, 4).kolom, 2, "lima orang: masih dua kolom");
  assert.equal(tataPanggilan("tersambung", true, true, 5).kolom, 3, "enam orang ke atas: tiga kolom");
}

// Pratinjau diri tampil SEJAK MEMANGGIL, bukan menunggu tersambung.
{
  const t = tataPanggilan("memanggil", true, true, 0);
  assert.equal(t.pratinjauDiriTerlihat, true, "pratinjau diri tampil sejak memanggil");
}

// Tanpa stream lokal tidak ada yang bisa dipratinjau.
{
  const t = tataPanggilan("memanggil", true, false, 0);
  assert.equal(t.pratinjauDiriTerlihat, false, "tanpa stream lokal, pratinjau tidak dipaksakan");
}

// Panggilan suara tidak menampilkan pratinjau kamera sama sekali.
{
  const t = tataPanggilan("tersambung", false, true, 1);
  assert.equal(t.pratinjauDiriTerlihat, false, "panggilan suara tidak butuh pratinjau kamera");
}

// eslint-disable-next-line no-console
console.log("tataPanggilan: semua pemeriksaan lulus");
