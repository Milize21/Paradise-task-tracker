/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker — kelola member di God Mode (B.E.R)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
// api service
import { APIService } from "../api.service";

export type TInstanceMember = {
  id: string;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_super_admin: boolean;
  /** 20 Admin · 15 Member · 5 Guest · null kalau belum jadi anggota workspace. */
  workspace_role: number | null;
  last_active: string | null;
  last_login_time: string | null;
  last_logout_time: string | null;
  last_login_ip: string | null;
  last_login_medium: string | null;
  created_at: string;
};

export type TInstanceMemberResponse = {
  count: number;
  total_pages: number;
  page: number;
  results: TInstanceMember[];
};

export type TMemberFilter = {
  search?: string;
  status?: "active" | "inactive";
  sort?: "name" | "email" | "last_active" | "last_login" | "created";
  page?: number;
  per_page?: number;
};

/**
 * Kelola member dari God Mode. Hanya Super Admin.
 *
 * Ini satu-satunya pintu masuk akun: pendaftaran mandiri dimatikan dan undangan
 * email belum bisa dipakai selama SMTP patah.
 */
export class InstanceMemberService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(filter: TMemberFilter = {}): Promise<TInstanceMemberResponse> {
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, v]) => v !== undefined && v !== null && v !== "")
    );
    return this.get("/api/instances/members/", { params })
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async create(data: { email: string; display_name: string; password: string }): Promise<TInstanceMember> {
    return this.post("/api/instances/members/", data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }

  async update(id: string, data: { is_active?: boolean; is_super_admin?: boolean }): Promise<TInstanceMember> {
    return this.patch(`/api/instances/members/${id}/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data ?? e;
      });
  }
}
