# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker: pesan langsung antar-karyawan (Yorukaze Production)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Obrolan dua orang di dalam satu workspace.

Tidak ada WebSocket di sini, dan itu disengaja untuk versi pertama. Peramban
menarik ulang percakapan yang sedang dibuka tiap beberapa detik. Untuk 79
karyawan beban itu tidak terasa, dan yang dihemat besar: tanpa ini kita perlu
menyambungkan `apps/live` ke sesi Django, memutuskan apa yang terjadi saat
sambungan putus, dan menguji dua jalur pengiriman yang bisa saling menyalip.

ponytail: tarik-ulang berkala, batasnya sekitar 200 orang mengobrol bersamaan.
Kalau tercapai, jalur naiknya sudah ada dan jangan ganti dengan Django Channels:
`apps/live` sudah memakai express-ws + Redis, jadi tambahkan satu rute di sana
yang menyiarkan pesan baru, dan endpoint ini tetap jadi satu-satunya penulis.
"""

# Django imports
from django.db.models import Count, Q
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkspaceEntityPermission
from plane.db.models import BATAS_ISI, PesanLangsung, WorkspaceMember

from .base import BaseAPIView

# Berapa pesan terakhir yang dikirim ke peramban saat percakapan dibuka.
# ponytail: tanpa penggulungan ke belakang. Pesan ke-101 masih ada di database
# dan tidak hilang, cuma belum bisa dilihat dari UI. Tambahkan parameter
# `sebelum=<created_at>` di sini kalau ada yang benar-benar memintanya.
JUMLAH_PESAN = 100


def _bentuk(pesan):
    return {
        "id": str(pesan.id),
        "pengirim": str(pesan.pengirim_id),
        "isi": pesan.isi,
        "created_at": pesan.created_at,
    }


class ChatConversationsEndpoint(BaseAPIView):
    """Daftar lawan bicara: pesan terakhir dan jumlah yang belum dibaca."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug):
        dasar = PesanLangsung.objects.filter(workspace__slug=slug)
        # Dua DISTINCT ON, satu per arah, lalu digabung di Python. Versi satu
        # kueri perlu menganotasi "siapa lawan bicaranya" dengan Case/When lalu
        # distinct pada anotasi itu, dan Django tidak bisa: `.distinct(...)`
        # meresolusi namanya sebagai medan model, jadi alias anotasi ditolak
        # dengan FieldError saat dijalankan, bukan saat ditulis.
        #
        # Yang penting tetap dapat: jumlah kuerinya tiga dan tidak tumbuh
        # mengikuti jumlah lawan bicara. Versi naifnya satu kueri per orang,
        # 79 kali bolak-balik ke database tiap kali halaman dibuka.
        terkirim = dasar.filter(pengirim=request.user).order_by("penerima_id", "-created_at").distinct("penerima_id")
        diterima = dasar.filter(penerima=request.user).order_by("pengirim_id", "-created_at").distinct("pengirim_id")

        terbaru = {}
        for pesan in [*terkirim, *diterima]:
            # Mengirim ke diri sendiri ditolak di POST, jadi kedua sisi ini
            # tidak akan pernah menunjuk orang yang sama.
            lawan = pesan.penerima_id if pesan.pengirim_id == request.user.id else pesan.pengirim_id
            sebelumnya = terbaru.get(lawan)
            if sebelumnya is None or pesan.created_at > sebelumnya.created_at:
                terbaru[lawan] = pesan

        belum_dibaca = dict(
            PesanLangsung.objects.filter(workspace__slug=slug, penerima=request.user, dibaca_pada__isnull=True)
            .values_list("pengirim_id")
            .annotate(jumlah=Count("id"))
        )

        percakapan = [
            {
                "lawan_bicara": str(lawan),
                "isi": pesan.isi,
                "dari_saya": pesan.pengirim_id == request.user.id,
                "created_at": pesan.created_at,
                "belum_dibaca": belum_dibaca.get(lawan, 0),
            }
            for lawan, pesan in terbaru.items()
        ]
        percakapan.sort(key=lambda baris: baris["created_at"], reverse=True)
        return Response(percakapan, status=status.HTTP_200_OK)


class ChatThreadEndpoint(BaseAPIView):
    """Isi percakapan dengan satu orang, dan pengiriman pesan baru."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, user_id):
        pesan = (
            PesanLangsung.objects.filter(workspace__slug=slug)
            .filter(
                Q(pengirim=request.user, penerima_id=user_id) | Q(pengirim_id=user_id, penerima=request.user)
            )
            .order_by("-created_at")[:JUMLAH_PESAN]
        )
        # Diambil menurun supaya yang terpotong adalah pesan TERTUA, lalu
        # dibalik supaya peramban menerimanya urut waktu.
        isi = [_bentuk(p) for p in reversed(list(pesan))]

        # Membuka percakapan berarti membacanya. Satu UPDATE beríndeks, dan
        # tidak melakukan apa-apa kalau memang tidak ada yang belum dibaca.
        PesanLangsung.objects.filter(
            workspace__slug=slug,
            pengirim_id=user_id,
            penerima=request.user,
            dibaca_pada__isnull=True,
        ).update(dibaca_pada=timezone.now())

        return Response(isi, status=status.HTTP_200_OK)

    def post(self, request, slug, user_id):
        isi = (request.data.get("isi") or "").strip()
        if not isi:
            return Response({"error": "Pesan kosong."}, status=status.HTTP_400_BAD_REQUEST)
        if len(isi) > BATAS_ISI:
            return Response(
                {"error": f"Pesan terlalu panjang, maksimum {BATAS_ISI} karakter."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if str(user_id) == str(request.user.id):
            return Response({"error": "Tidak bisa mengirim pesan ke diri sendiri."}, status=status.HTTP_400_BAD_REQUEST)

        # Penerima WAJIB diperiksa di sini, bukan cuma di UI. Tanpa ini, id
        # siapa pun yang ditebak dari URL bisa dikirimi pesan, termasuk orang
        # dari workspace lain di instance yang sama.
        anggota = WorkspaceMember.objects.filter(
            workspace__slug=slug, member_id=user_id, is_active=True
        ).first()
        if anggota is None:
            return Response({"error": "Orang itu bukan anggota aktif workspace ini."}, status=status.HTTP_404_NOT_FOUND)

        pesan = PesanLangsung.objects.create(
            workspace_id=anggota.workspace_id,
            pengirim=request.user,
            penerima_id=user_id,
            isi=isi,
        )
        return Response(_bentuk(pesan), status=status.HTTP_201_CREATED)
