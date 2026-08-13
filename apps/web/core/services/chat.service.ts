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

export type TPesan = {
  id: string;
  pengirim: string;
  isi: string;
  created_at: string;
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

  async getJumlahBelumDibaca(workspaceSlug: string): Promise<number> {
    return this.get(`/api/workspaces/${workspaceSlug}/chat/belum-dibaca/`)
      .then((res) => res?.data?.jumlah ?? 0)
      .catch((e) => {
        // Dilempar, bukan ditelan jadi 0. SWR menyimpannya di `error` dan
        // lencana cukup tidak tampil; menelannya berarti "tidak ada pesan baru"
        // dan "endpointnya rusak" terlihat persis sama.
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

  async kirimPesan(workspaceSlug: string, userId: string, isi: string): Promise<TPesan> {
    return this.post(`/api/workspaces/${workspaceSlug}/chat/${userId}/`, { isi })
      .then((res) => res?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
}
