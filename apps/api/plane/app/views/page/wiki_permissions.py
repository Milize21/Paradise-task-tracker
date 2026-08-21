# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker: izin Wiki borongan (Yorukaze Production)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Page, ProjectMember, WikiFolderAccess
from plane.utils.wiki_access import is_super_admin, is_wiki_governed

_ROLE_ADMIN = ROLE.ADMIN.value


class WikiPermissionsEndpoint(BaseAPIView):
    """Sekali tanya, semua kartu Wiki tahu apa yang boleh dilakukan pemakainya.

    Endpoint `can-edit` yang sudah ada menjawab satu halaman per permintaan.
    Itu benar untuk server Live yang memang membuka satu dokumen, tapi salah
    untuk halaman daftar: sepuluh kartu Divisi berarti sepuluh permintaan tiap
    kali orang membuka Wiki.

    Yang dikembalikan hanya bendera per folder TERATAS, bukan per halaman,
    karena resolver izin memang selalu naik ke folder teratas. Jadi klien cukup
    menelusuri satu halaman ke induknya untuk tahu haknya, tanpa menyalin satu
    pun aturan izin ke TypeScript.

    Sengaja TIDAK mengembalikan daftar orang atau divisi: ini jawaban tentang
    pemakai yang bertanya, bukan direktori.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        user = request.user

        folders = list(
            Page.objects.filter(
                projects=project_id,
                parent__isnull=True,
                workspace__slug=slug,
                deleted_at__isnull=True,
            )
            .order_by("name")
            .values_list("id", flat=True)
        )

        owners = {}
        for folder_id, division_id in WikiFolderAccess.objects.filter(
            folder_id__in=folders, project_id=project_id, deleted_at__isnull=True
        ).values_list("folder_id", "division_id"):
            owners.setdefault(folder_id, set()).add(division_id)

        # Satu query untuk seluruh keanggotaan aktif si pemakai, bukan satu per
        # folder. Di 83 anggota dan 10 folder bedanya belum terasa; di angka
        # berapa pun, sepuluh query untuk pertanyaan yang sama tetap salah.
        memberships = dict(
            ProjectMember.objects.filter(
                member=user, is_active=True, deleted_at__isnull=True
            ).values_list("project_id", "role")
        )

        super_admin = is_super_admin(user)
        project_admin = memberships.get(project_id) == _ROLE_ADMIN

        payload = []
        for folder_id in folders:
            division_ids = owners.get(folder_id, set())
            roles = [memberships[d] for d in division_ids if d in memberships]
            payload.append(
                {
                    "id": str(folder_id),
                    # Boleh menaruh Topik/Materi baru di dalam folder ini.
                    "can_upload": bool(roles) or super_admin,
                    # Boleh membereskan materi orang lain di folder ini.
                    "is_lead": any(r == _ROLE_ADMIN for r in roles),
                    # Folder "General": pemiliknya project Wiki itu sendiri,
                    # jadi seluruh anggota Wiki boleh mengunggah ke sini.
                    "is_general": project_id in division_ids,
                }
            )

        return Response(
            {
                "is_governed": is_wiki_governed(project_id),
                "is_super_admin": super_admin,
                "is_project_admin": project_admin,
                "user_id": str(user.id),
                "folders": payload,
            },
            status=status.HTTP_200_OK,
        )
