/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: aturan kepemilikan tugas (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { EUserPermissionsLevel } from "@plane/constants";
import type { TIssue } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
// hooks
import { useUser, useUserPermissions } from "@/hooks/store/user";
// services
import { UserService } from "@/services/user.service";

const userService = new UserService();

/**
 * Aturan kepemilikan tugas, sisi tampilan.
 *
 *     hapus / arsipkan   pembuatnya, Super Admin, atau admin project
 *     ganti Due Date     HANYA pembuatnya atau Super Admin
 *     sisanya            bebas untuk semua anggota
 *
 * Penegak yang sebenarnya ada di server (`plane/utils/task_access.py`), dan ini
 * TIDAK menggantikannya. Gunanya cuma satu: jangan menampilkan kontrol yang
 * pasti ditolak. Tombol yang terlihat aktif lalu gagal adalah cara paling cepat
 * membuat orang berhenti percaya pada aplikasinya.
 *
 * Karena itu, kalau syarat di sini dan di server sampai berbeda, yang harus
 * diubah adalah YANG DI SINI. Server tetap pemegang keputusan.
 */
export const useAturanTugas = () => {
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();

  // Status Super Admin tidak ikut di payload `me`, jadi diambil dari endpoint
  // khususnya. Kuncinya tetap, jadi SWR menyimpannya untuk seluruh sesi dan
  // ini bukan permintaan per layar.
  const { data: statusAdmin } = useSWR(currentUser?.id ? "STATUS_SUPER_ADMIN" : null, () =>
    userService.currentUserInstanceAdminStatus()
  );

  const adalahPembuat = (issue: TIssue | undefined | null) =>
    !!issue && !!currentUser?.id && issue.created_by === currentUser.id;

  // Super Admin instance. Di aplikasi web namanya `is_instance_admin`, dan itu
  // orang yang sama dengan yang dijawab `super_admin_user_ids()` di server.
  const adalahSuperAdmin = () => !!statusAdmin?.is_instance_admin;

  return {
    /** Boleh menggeser Due Date. Sengaja tidak termasuk admin project. */
    bisaGantiTenggat: (issue: TIssue | undefined | null) => adalahPembuat(issue) || adalahSuperAdmin(),

    /** Boleh menghapus atau mengarsipkan. Admin project ikut boleh. */
    bisaHapusTugas: (issue: TIssue | undefined | null, projectId?: string) =>
      adalahPembuat(issue) ||
      adalahSuperAdmin() ||
      allowPermissions([EUserProjectRoles.ADMIN], EUserPermissionsLevel.PROJECT, undefined, projectId),
  };
};
