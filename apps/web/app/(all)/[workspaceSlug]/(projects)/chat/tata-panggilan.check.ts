/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: pemeriksaan tata layar panggilan
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Jalankan DARI packages/i18n, karena tsx hanya terpasang di situ:
 *   pnpm exec tsx "../../apps/web/app/(all)/[workspaceSlug]/(projects)/chat/tata-panggilan.check.ts"
 */

import assert from "node:assert/strict";
import { tataPanggilan } from "./tata-panggilan";

// Diam: tidak ada apa pun di layar.
{
  const t = tataPanggilan("diam", true, true, true);
  assert.equal(t.tampil, false, "status diam tidak boleh menampilkan layar panggilan");
  assert.equal(t.mediaLawanTerpasang, false, "tanpa layar, tidak ada elemen media");
}

// INI YANG PERNAH SALAH DAN MEMBUAT PANGGILAN SUNYI TOTAL.
// Panggilan suara: tidak ada gambar, tapi elemen media lawan WAJIB terpasang,
// karena di situlah audionya keluar.
{
  const t = tataPanggilan("tersambung", false, true, true);
  assert.equal(t.gambarLawanTerlihat, false, "panggilan suara tidak menampilkan gambar");
  assert.equal(t.mediaLawanTerpasang, true, "media lawan WAJIB terpasang walau tanpa gambar");
}

// Media lawan tetap terpasang bahkan sebelum tersambung, supaya aliran pertama
// tidak tiba saat elemennya belum ada.
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
  const t = tataPanggilan("tersambung", false, true, true);
  assert.equal(t.pratinjauDiriTerlihat, false, "panggilan suara tidak butuh pratinjau kamera");
}

// Video tapi media lawan belum tiba: jangan tampilkan kotak hitam kosong, itu
// terlihat seperti kerusakan.
{
  const t = tataPanggilan("tersambung", true, true, false);
  assert.equal(t.gambarLawanTerlihat, false, "tanpa stream lawan, jangan tampilkan kotak kosong");
  assert.equal(t.mediaLawanTerpasang, true, "elemennya tetap terpasang menunggu aliran tiba");
}

// eslint-disable-next-line no-console
console.log("tataPanggilan: semua pemeriksaan lulus");
