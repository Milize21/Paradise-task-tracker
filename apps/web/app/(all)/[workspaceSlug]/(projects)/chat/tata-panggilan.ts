/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: tata letak layar panggilan (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TStatusPanggilan } from "./panggilan";

export type TTataPanggilan = {
  /** Layar panggilan ditampilkan sama sekali. */
  tampil: boolean;
  /** Ada peserta lain yang medianya sudah tiba. */
  adaPeserta: boolean;
  /** Jumlah kolom kisi peserta. */
  kolom: number;
  pratinjauDiriTerlihat: boolean;
};

/**
 * Apa yang tampil di layar panggilan, sebagai fungsi murni.
 *
 * Dipisahkan dari komponennya supaya bisa diuji tanpa DOM. Dua aturan di sini
 * pernah salah dan menghasilkan panggilan yang terasa rusak tanpa error apa pun:
 * elemen media yang dirender bersyarat sehingga audionya tidak punya tempat
 * keluar, dan gambar lawan yang digantungkan pada NIAT memakai video alih-alih
 * pada media yang benar-benar tiba.
 */
export function tataPanggilan(
  status: TStatusPanggilan,
  pakaiVideo: boolean,
  adaStreamLokal: boolean,
  jumlahPeserta: number
): TTataPanggilan {
  if (status === "diam") {
    return { tampil: false, adaPeserta: false, kolom: 1, pratinjauDiriTerlihat: false };
  }

  // Peserta hanya dianggap ada kalau medianya sudah tiba, bukan kalau kita
  // sedang berniat menelepon. Menggantungkannya pada niat membuat layar
  // menampilkan kotak kosong yang terlihat seperti kerusakan.
  const adaPeserta = status === "tersambung" && jumlahPeserta > 0;

  return {
    tampil: true,
    adaPeserta,
    // Satu lawan bicara tampil besar; mulai tiga orang barulah dibagi dua kolom.
    // Kisi yang selalu dipaksakan membuat panggilan berdua terlihat sempit
    // tanpa alasan.
    kolom: jumlahPeserta <= 1 ? 1 : jumlahPeserta <= 4 ? 2 : 3,
    // Sejak memanggil, bukan setelah tersambung: kalau kameranya bermasalah,
    // orang tahu sejak detik pertama.
    pratinjauDiriTerlihat: pakaiVideo && adaStreamLokal,
  };
}
