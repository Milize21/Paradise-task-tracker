# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker — Resolver ACL Wiki (B.E.R)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Satu sumber kebenaran "boleh edit halaman ini?" — dipakai oleh izin API Django
# (ProjectPagePermission) DAN endpoint can-edit untuk server Live. Jangan
# duplikat logika ini di tempat lain: dua penegak, satu aturan.

_MAX_DEPTH = 50  # jaga-jaga dari rantai parent melingkar / rusak


def is_wiki_governed(project_id):
    """True kalau project ini Wiki ber-ACL folder (punya baris WikiGovernedProject)."""
    from plane.db.models import WikiGovernedProject

    return WikiGovernedProject.objects.filter(
        project_id=project_id, deleted_at__isnull=True
    ).exists()


def top_level_folder(page):
    """Telusuri naik rantai parent ke halaman folder paling atas.

    Sub-halaman mewarisi kepemilikan folder top-level-nya, jadi izin selalu
    dievaluasi terhadap folder teratas.
    """
    seen = set()
    depth = 0
    while page.parent_id and page.parent_id not in seen and depth < _MAX_DEPTH:
        seen.add(page.id)
        page = page.parent
        depth += 1
    return page


def owning_division_ids(folder):
    """ID divisi (project) yang anggotanya boleh mengedit folder ini."""
    from plane.db.models import WikiFolderAccess

    return list(
        WikiFolderAccess.objects.filter(folder=folder, deleted_at__isnull=True).values_list(
            "division_id", flat=True
        )
    )


def can_edit_wiki_page(user, page):
    """True kalau `user` boleh MENGEDIT `page` di Wiki ber-ACL.

    Aturan: user harus anggota aktif salah satu divisi pemilik folder top-level.
    Folder tanpa pemilik → False (hanya admin, ditangani di lapisan izin).
    Tidak memakai kepemilikan halaman individual: hak edit murni per-divisi.
    """
    from plane.db.models import ProjectMember

    if user is None or getattr(user, "is_anonymous", True):
        return False

    folder = top_level_folder(page)
    division_ids = owning_division_ids(folder)
    if not division_ids:
        return False

    return ProjectMember.objects.filter(
        member=user,
        project_id__in=division_ids,
        is_active=True,
        deleted_at__isnull=True,
    ).exists()
