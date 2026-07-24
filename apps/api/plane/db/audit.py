# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Jejak audit: mencatat SIAPA mengubah APA pada entitas sensitif (akses & konten
# inti). Ditenagai django-auditlog (MIT, jazzband) — lihat NOTICE. Aktor + IP
# ditangkap oleh auditlog.middleware.AuditlogMiddleware (lihat settings.MIDDLEWARE).
#
# Field body besar (biner/HTML) sengaja dikecualikan: diff-nya raksasa dan riwayat
# konten halaman sudah dilacak terpisah oleh PageVersion.

from auditlog.registry import auditlog

# Field editor yang tak boleh masuk diff audit
_PAGE_BODY = [
    "description_binary",
    "description_html",
    "description_json",
    "description_stripped",
    "view_props",
    "logo_props",
]
_ISSUE_BODY = [
    "description_binary",
    "description_html",
    "description_json",
    "description_stripped",
]


def register_audit_models():
    """Daftarkan model sensitif ke auditlog. Dipanggil dari DbConfig.ready()."""
    from plane.db.models import (
        Issue,
        Page,
        Project,
        ProjectMember,
        WorkspaceMember,
    )

    # Perubahan akses/keanggotaan (peran = hak akses)
    auditlog.register(Project)
    auditlog.register(ProjectMember)
    auditlog.register(WorkspaceMember)

    # Konten inti — metadata saja, bukan isi editor
    auditlog.register(Issue, exclude_fields=_ISSUE_BODY)
    auditlog.register(Page, exclude_fields=_PAGE_BODY)
