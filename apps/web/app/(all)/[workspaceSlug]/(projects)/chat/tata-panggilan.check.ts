/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: pemeriksaan tata layar panggilan
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Jalankan DARI packages/i18n, karena tsx hanya terpasang di situ:
 *   pnpm exec tsx "../../apps/web/app/(all)/[workspaceSlug]/(projects)/chat/tata-panggilan.check.ts"
 *
 * Urutan argumen: (status, pakaiVideo, adaStreamLokal, adaVideoJauh)
 */

import assert from "node:assert/strict";
import { tataPanggilan } from "./tata-panggilan";

// Diam: tidak ada apa pun di layar.
{
  const t = tataPanggilan("diam", true, true, true);
  assert.equal(t.tampil, false, "status diam tidak boleh menampilkan layar panggilan");
  assert.equal(t.mediaLawanTerpasang, false, "tanpa layar, tidak ada elemen media");
}

// PERNAH SALAH #1, panggilan sunyi total.
// Panggilan suara: tidak ada gambar, tapi elemen media lawan WAJIB terpasang,
// karena di situlah audionya keluar.
{
  const t = tataPanggilan("tersambung", false, true, false);
  assert.equal(t.gambarLawanTerlihat, false, "panggilan suara tidak menampilkan gambar");
  assert.equal(t.mediaLawanTerpasang, true, "media lawan WAJIB terpasang walau tanpa gambar");
}

// PERNAH SALAH #2, panggilan video tanpa gambar lawan.
// Negosiasi video bisa gagal sementara audionya lolos. Saat itu terjadi,
// `pakaiVideo` TETAP menyala karena ia cuma menyatakan niat saat menekan
// tombol. Menggantungkan tampilan padanya berarti menampilkan kotak hitam
// kosong yang terlihat seperti kerusakan, padahal panggilannya hidup.
{
  const t = tataPanggilan("tersambung", true, true, false);
  assert.equal(
    t.gambarLawanTerlihat,
    false,
    "video diniatkan tapi track video tidak pernah tiba: jangan tampilkan kotak kosong"
  );
  assert.equal(t.mediaLawanTerpasang, true, "elemennya tetap terpasang, audionya harus tetap keluar");
}

// Begitu track video benar-benar tiba, gambarnya ditampilkan.
{
  const t = tataPanggilan("tersambung", true, true, true);
  assert.equal(t.gambarLawanTerlihat, true, "track video tiba, gambarnya harus tampil");
}

// Belum tersambung: apa pun keadaan tracknya, belum ada yang ditampilkan.
for (const status of ["memanggil", "berdering"] as const) {
  const t = tataPanggilan(status, true, true, true);
  assert.equal(t.gambarLawanTerlihat, false, `belum tersambung (${status}), gambar lawan belum ditampilkan`);
}

// Media lawan tetap terpasang di setiap tahap, supaya aliran pertama tidak tiba
// saat elemennya belum ada.
for (const status of ["memanggil", "berdering", "tersambung"] as const) {
  const t = tataPanggilan(status, true, false, false);
  assert.equal(t.mediaLawanTerpasang, true, `media lawan harus terpasang saat ${status}`);
}

// Pratinjau diri tampil SEJAK MEMANGGIL, bukan menunggu tersambung.
{
  const t = tataPanggilan("memanggil", true, true, false);
  assert.equal(t.pratinjauDiriTerlihat, true, "pratinjau diri tampil sejak memanggil");
}

// Tanpa stream lokal tidak ada yang bisa dipratinjau.
{
  const t = tataPanggilan("memanggil", true, false, false);
  assert.equal(t.pratinjauDiriTerlihat, false, "tanpa stream lokal, pratinjau tidak dipaksakan");
}

// Panggilan suara tidak menampilkan pratinjau diri sama sekali.
{
  const t = tataPanggilan("tersambung", false, true, false);
  assert.equal(t.pratinjauDiriTerlihat, false, "panggilan suara tidak butuh pratinjau kamera");
}

// eslint-disable-next-line no-console
console.log("tataPanggilan: semua pemeriksaan lulus");
