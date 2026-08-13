/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: pesan langsung antar-karyawan (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

export type TPercakapan = {
  lawan_bicara: string;
  isi: string;
  dari_saya: boolean;
  created_at: string;
  belum_dibaca: number;
};

export type TLampiran = {
  id: string;
  nama: string;
  tipe: string;
  ukuran: number;
  /** URL berpenjaga; hanya pengirim, penerima, dan pemilik workspace. */
  url: string;
};

export type TReaksi = { emoji: string; orang: string[] };

export type TKutipan = { id: string; pengirim: string; isi: string };

export type TPesan = {
  id: string;
  pengirim: string;
  isi: string;
  created_at: string;
  lampiran: TLampiran[];
  disunting: boolean;
  /** Hanya berarti untuk pesan keluar. */
  sudah_dibaca: boolean;
  balasan_ke: TKutipan | null;
  reaksi: TReaksi[];
  /** Belum dibaca saat percakapan ini dimuat. Dihitung server SEBELUM menandai
   * terbaca, jadi hanya benar pada muatan pertama sesudah pesan itu masuk. */
  baru: boolean;
};

/** Kunci SWR untuk jumlah belum dibaca.
 *
 * Dipakai di DUA tempat: lencana di sidebar yang menariknya berkala, dan halaman
 * Obrolan yang memanggil `mutate` pada kunci ini begitu percakapan dibaca. Tanpa
 * kunci bersama, lencana baru turun pada tarikan berikutnya dan orang melihat
 * angka yang sudah tidak benar selama setengah menit. */
export const KUNCI_BELUM_DIBACA = "CHAT_BELUM_DIBACA";

export type TStatusObrolan = {
  jumlah: number;
  /** Pemilik workspace: boleh membuka layar pengawasan. */
  pengawas: boolean;
};

/** Satu percakapan antara dua orang, dilihat dari layar pengawasan. */
export type TPasanganObrolan = {
  orang: [string, string];
  jumlah: number;
  terakhir: string;
};

export class ChatService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getPercakapan(workspaceSlug: string): Promise<TPercakapan[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/chat/`)
      .then((res) => res?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async getStatus(workspaceSlug: string): Promise<TStatusObrolan> {
    return this.get(`/api/workspaces/${workspaceSlug}/chat/belum-dibaca/`)
      .then((res) => ({ jumlah: res?.data?.jumlah ?? 0, pengawas: res?.data?.pengawas ?? false }))
      .catch((e) => {
        // Dilempar, bukan ditelan jadi 0. SWR menyimpannya di `error` dan
        // lencana cukup tidak tampil; menelannya berarti "tidak ada pesan baru"
        // dan "endpointnya rusak" terlihat persis sama.
        throw e?.response?.data;
      });
  }

  /** Pesan lebih lama dari `sebelum`. Kursor waktu, bukan nomor halaman:
   * pesan baru terus berdatangan di ujung lain dan nomor halaman akan bergeser
   * di bawah jari orang yang sedang menggulung. */
  async getPesanLama(workspaceSlug: string, userId: string, sebelum: string): Promise<TPesan[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/chat/${userId}/`, { params: { sebelum } })
      .then((res) => res?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async suntingPesan(workspaceSlug: string, pesanId: string, isi: string): Promise<TPesan> {
    return this.patch(`/api/workspaces/${workspaceSlug}/chat/pesan/${pesanId}/`, { isi })
      .then((res) => res?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async hapusPesan(workspaceSlug: string, pesanId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/chat/pesan/${pesanId}/`)
      .then((res) => res?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async toggleReaksi(workspaceSlug: string, pesanId: string, emoji: string): Promise<{ aktif: boolean }> {
    return this.post(`/api/workspaces/${workspaceSlug}/chat/pesan/${pesanId}/reaksi/`, { emoji })
      .then((res) => res?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async getPengawasan(workspaceSlug: string): Promise<TPasanganObrolan[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/chat/pengawasan/`)
      .then((res) => res?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async getPengawasanPesan(workspaceSlug: string, a: string, b: string): Promise<TPesan[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/chat/pengawasan/${a}/${b}/`)
      .then((res) => res?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async getPesan(workspaceSlug: string, userId: string): Promise<TPesan[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/chat/${userId}/`)
      .then((res) => res?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async kirimPesan(
    workspaceSlug: string,
    userId: string,
    isi: string,
    lampiran: string[] = [],
    balasanKe?: string
  ): Promise<TPesan> {
    return this.post(`/api/workspaces/${workspaceSlug}/chat/${userId}/`, {
      isi,
      lampiran,
      balasan_ke: balasanKe ?? null,
    })
      .then((res) => res?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
}
