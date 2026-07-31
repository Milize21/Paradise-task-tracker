# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker — kelola member di God Mode (B.E.R)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.paginator import Paginator
from django.db.models import Q

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.db.models import User, Workspace, WorkspaceMember
from plane.db.superadmin import sinkronkan_super_admin, super_admin_user_ids
from plane.license.api.views.base import BaseAPIView
from plane.license.models import Instance, InstanceAdmin

_DEFAULT_PER_PAGE = 50
_MAX_PER_PAGE = 200

_URUTAN = {
    "name": "display_name",
    "email": "email",
    "last_active": "-last_active",
    "last_login": "-last_login_time",
    "created": "-created_at",
}


def _uname(email):
    """Pola username di repo ini: email dengan '.' dan '@' jadi '_'."""
    return email.replace(".", "_").replace("@", "_")


def _serialize(u, super_admin_ids, ws_role):
    return {
        "id": str(u.id),
        "email": u.email,
        "display_name": u.display_name,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "is_active": u.is_active,
        "is_super_admin": u.id in super_admin_ids,
        "workspace_role": ws_role.get(u.id),
        # Aktivitas: sudah direkam otomatis oleh alur autentikasi, selama ini
        # tidak pernah ditampilkan di mana pun.
        "last_active": u.last_active,
        "last_login_time": u.last_login_time,
        "last_logout_time": u.last_logout_time,
        "last_login_ip": u.last_login_ip,
        "last_login_medium": u.last_login_medium,
        "created_at": u.created_at,
    }


class InstanceMemberEndpoint(BaseAPIView):
    """Kelola member dari God Mode — daftar, buat, ubah, nonaktifkan.

    Hanya instance admin (izin dari `BaseAPIView` God Mode).

    Ini **satu-satunya** pintu masuk akun sekarang: pendaftaran mandiri sudah
    dimatikan (`ENABLE_SIGNUP=0`) dan undangan lewat email belum bisa dipakai
    selama SMTP masih patah. Tanpa halaman ini, menambah karyawan baru harus
    lewat skrip.

    Menonaktifkan, bukan menghapus baris: menghapus User akan memutus rujukan
    di jejak audit, worklog, dan riwayat mana pun yang menyentuhnya. Nonaktif
    sudah menghasilkan yang dimaksud — tidak bisa masuk, tidak muncul sebagai
    anggota — dan bisa dibalik.
    """

    def get(self, request):
        qs = User.objects.filter(is_bot=False)

        cari = (request.GET.get("search") or "").strip()
        if cari:
            qs = qs.filter(
                Q(email__icontains=cari) | Q(display_name__icontains=cari) | Q(first_name__icontains=cari)
            )

        status_filter = request.GET.get("status")
        if status_filter == "active":
            qs = qs.filter(is_active=True)
        elif status_filter == "inactive":
            qs = qs.filter(is_active=False)

        qs = qs.order_by(_URUTAN.get(request.GET.get("sort"), "display_name"))

        try:
            per_page = min(int(request.GET.get("per_page", _DEFAULT_PER_PAGE)), _MAX_PER_PAGE)
        except ValueError:
            per_page = _DEFAULT_PER_PAGE
        per_page = max(per_page, 1)

        paginator = Paginator(qs, per_page)
        page = paginator.get_page(request.GET.get("page", 1))

        sa = super_admin_user_ids()
        ws_role = dict(
            WorkspaceMember.objects.filter(member__in=page.object_list).values_list("member_id", "role")
        )

        return Response(
            {
                "count": paginator.count,
                "total_pages": paginator.num_pages,
                "page": page.number,
                "results": [_serialize(u, sa, ws_role) for u in page.object_list],
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        """Buat akun baru. Satu-satunya jalan masuk selama signup mati."""
        email = (request.data.get("email") or "").strip().lower()
        nama = (request.data.get("display_name") or "").strip()
        password = request.data.get("password") or ""

        if not email or "@" not in email:
            return Response({"error": "Email tidak sah."}, status=status.HTTP_400_BAD_REQUEST)
        if not nama:
            return Response({"error": "Nama wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        # Tanpa batas minimum, akun baru bisa lahir dengan password satu huruf —
        # dan orangnya tidak akan pernah tahu itu lemah.
        if len(password) < 8:
            return Response(
                {"error": "Password minimal 8 karakter."}, status=status.HTTP_400_BAD_REQUEST
            )
        if User.objects.filter(email=email).exists():
            return Response({"error": "Email sudah dipakai."}, status=status.HTTP_400_BAD_REQUEST)

        bagian = nama.split()
        u = User.objects.create(
            email=email,
            username=_uname(email),
            display_name=nama,
            first_name=bagian[0],
            last_name=" ".join(bagian[1:]) if len(bagian) > 1 else "",
            is_password_autoset=False,
        )
        u.set_password(password)
        u.save()

        # Tanpa WorkspaceMember, akunnya ada tapi tidak bisa masuk ke mana pun.
        ws = Workspace.objects.first()
        if ws:
            WorkspaceMember.objects.get_or_create(workspace=ws, member=u, defaults={"role": 15})

        return Response(
            _serialize(u, super_admin_user_ids(), {}), status=status.HTTP_201_CREATED
        )

    def patch(self, request, pk):
        """Ubah status aktif atau status Super Admin."""
        u = User.objects.filter(pk=pk, is_bot=False).first()
        if not u:
            return Response({"error": "Akun tidak ditemukan."}, status=status.HTTP_404_NOT_FOUND)

        if "is_active" in request.data:
            aktif = bool(request.data["is_active"])
            # Menonaktifkan diri sendiri akan mengunci orang itu keluar dari
            # halaman yang sedang ia pakai — tolak, jangan biarkan.
            if not aktif and u.id == request.user.id:
                return Response(
                    {"error": "Tidak bisa menonaktifkan akun sendiri."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            u.is_active = aktif
            u.save(update_fields=["is_active"])

        if "is_super_admin" in request.data:
            jadikan = bool(request.data["is_super_admin"])
            instance = Instance.objects.first()
            if not instance:
                return Response(
                    {"error": "Instance belum terdaftar."}, status=status.HTTP_400_BAD_REQUEST
                )
            if jadikan:
                InstanceAdmin.objects.get_or_create(
                    instance=instance, user=u, defaults={"role": 20, "is_verified": True}
                )
                # Susulkan akses ke project yang sudah ada; project baru ikut
                # sendiri lewat signal.
                sinkronkan_super_admin(user_id=u.id)
            else:
                if u.id == request.user.id:
                    return Response(
                        {"error": "Tidak bisa mencabut status Super Admin sendiri."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if InstanceAdmin.objects.filter(instance=instance).count() <= 1:
                    return Response(
                        {"error": "Harus ada minimal satu Super Admin."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                InstanceAdmin.objects.filter(instance=instance, user=u).delete()

        ws_role = dict(WorkspaceMember.objects.filter(member=u).values_list("member_id", "role"))
        return Response(_serialize(u, super_admin_user_ids(), ws_role), status=status.HTTP_200_OK)
