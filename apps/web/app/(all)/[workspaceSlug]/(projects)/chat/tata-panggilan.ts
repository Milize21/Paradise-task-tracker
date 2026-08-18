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
  /** Elemen media lawan terpasang di DOM.
   *
   * Bedakan dari `gambarLawanTerlihat`: saat panggilan suara, elemennya TETAP
   * harus terpasang walau tidak terlihat, karena di situlah audionya keluar. */
  mediaLawanTerpasang: boolean;
  gambarLawanTerlihat: boolean;
  pratinjauDiriTerlihat: boolean;
};

/**
 * Apa yang tampil di layar panggilan, sebagai fungsi murni.
 *
 * Dipisahkan dari komponennya supaya bisa diuji tanpa DOM. Aturan yang dijaga di
 * sini pernah salah dan membuat panggilan sunyi total: elemen media lawan
 * sempat ikut dirender bersyarat, sehingga saat panggilan suara ia tidak ada
 * sama sekali dan audionya tidak punya tempat keluar. Tidak ada error, tidak
 * ada gejala di layar, cuma sunyi.
 */
export function tataPanggilan(
  status: TStatusPanggilan,
  pakaiVideo: boolean,
  adaStreamLokal: boolean,
  adaStreamJauh: boolean
): TTataPanggilan {
  if (status === "diam") {
    return {
      tampil: false,
      mediaLawanTerpasang: false,
      gambarLawanTerlihat: false,
      pratinjauDiriTerlihat: false,
    };
  }

  return {
    tampil: true,
    // Selalu, tanpa syarat apa pun selain layarnya tampil.
    mediaLawanTerpasang: true,
    gambarLawanTerlihat: status === "tersambung" && pakaiVideo && adaStreamJauh,
    // Sejak memanggil, bukan setelah tersambung: kalau kameranya bermasalah,
    // orang tahu sejak detik pertama.
    pratinjauDiriTerlihat: pakaiVideo && adaStreamLokal,
  };
}
