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

# Python imports
import logging

# Django imports
from django.db.models import Count, Max, Q
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkspaceEntityPermission
from plane.db.models import BATAS_ISI, PesanLangsung, Workspace, WorkspaceMember

from .base import BaseAPIView

# "plane.api", BUKAN "plane". Konfigurasi logging produksi memakai
# disable_existing_loggers dan TIDAK punya entri untuk "plane" polos, jadi
# catatan yang dikirim ke sana tidak sampai ke mana-mana. Untuk jejak audit,
# itu kegagalan yang paling buruk bentuknya: terlihat ada di kode, tidak ada
# di kenyataan, dan baru ketahuan saat dibutuhkan.
logger = logging.getLogger("plane.api")

# Berapa pesan terakhir yang dikirim ke peramban saat percakapan dibuka.
# ponytail: tanpa penggulungan ke belakang. Pesan ke-101 masih ada di database
# dan tidak hilang, cuma belum bisa dilihat dari UI. Tambahkan parameter
# `sebelum=<created_at>` di sini kalau ada yang benar-benar memintanya.
JUMLAH_PESAN = 100

# Berapa pesan yang ditampilkan di layar pengawasan sekali buka.
JUMLAH_PESAN_PENGAWASAN = 500


def _pengawas(request, slug) -> bool:
    """Boleh membaca obrolan orang lain?

    HANYA pemilik workspace. Sengaja BUKAN `super_admin_user_ids()` yang dipakai
    penyembunyian project, walaupun itu terdengar setara: instance ini punya
    lima instance admin dan tiga di antaranya akun vendor luar
    (@itechmandiri.com). Melihat seluruh project adalah kewenangan operasional;
    membaca pesan pribadi 79 orang bukan, dan memberikannya ke pihak ketiga
    lewat kesetaraan peran adalah keputusan yang tidak pernah diambil siapa pun
    secara sadar.

    Kalau nanti memang diinginkan, ganti isi fungsi ini, jangan tambal di
    endpoint satu per satu.
    """
    return Workspace.objects.filter(slug=slug, owner=request.user).exists()


def _bentuk(pesan, saya_id=None):
    return {
        "id": str(pesan.id),
        "pengirim": str(pesan.pengirim_id),
        "isi": pesan.isi,
        "created_at": pesan.created_at,
        # Dipakai UI untuk menarik garis "pesan belum dibaca" di posisi yang
        # tepat. WAJIB dihitung SEBELUM percakapan ditandai terbaca: sesudah
        # UPDATE jalan, semuanya sudah terbaca dan garisnya tidak akan pernah
        # muncul untuk siapa pun.
        "baru": pesan.dibaca_pada is None and pesan.pengirim_id != saya_id,
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


class ChatUnreadEndpoint(BaseAPIView):
    """Jumlah pesan belum dibaca di seluruh workspace, untuk lencana sidebar.

    Endpoint terpisah dari daftar percakapan, dan itu bukan duplikasi: lencana
    ini hidup di sidebar, jadi ikut ditarik dari SETIAP halaman. Memakai
    endpoint percakapan untuk itu berarti membawa isi pesan terakhir setiap
    lawan bicara ke tiap halaman cuma untuk menampilkan satu angka.

    Satu COUNT yang seluruhnya dilayani indeks `dm_penerima_dibaca_idx`.
    """

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug):
        jumlah = PesanLangsung.objects.filter(
            workspace__slug=slug, penerima=request.user, dibaca_pada__isnull=True
        ).count()
        # `pengawas` menumpang di sini, dan itu disengaja: endpoint ini sudah
        # ditarik dari setiap halaman, jadi UI bisa tahu apakah perlu menampilkan
        # tautan pengawasan tanpa satu pun permintaan tambahan. Menaruhnya di
        # endpoint sendiri berarti 79 orang memanggil endpoint yang jawabannya
        # "tidak" selamanya.
        return Response(
            {"jumlah": jumlah, "pengawas": _pengawas(request, slug)},
            status=status.HTTP_200_OK,
        )


class ChatPengawasanEndpoint(BaseAPIView):
    """Daftar SELURUH percakapan di workspace, untuk pemilik instance.

    Aplikasi internal perusahaan, dan pemiliknya berhak mengawasi. Tiga hal
    dipasang supaya kewenangan ini tetap bisa dipertanggungjawabkan:

    1. Hanya pemilik workspace, lihat `_pengawas()`.
    2. Tiap pembacaan dicatat ke log aplikasi berikut siapa membaca percakapan
       siapa. Kewenangan yang tidak meninggalkan jejak adalah kewenangan yang
       tidak bisa dibela kalau suatu hari dipertanyakan.
    3. Membaca di sini TIDAK menandai pesan terbaca. Kalau menandai, penerima
       aslinya kehilangan tanda "belum dibaca" tanpa pernah membukanya, dan
       pengawasan diam-diam mengubah keadaan yang diawasinya.
    """

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug):
        if not _pengawas(request, slug):
            return Response({"error": "Hanya pemilik workspace."}, status=status.HTTP_403_FORBIDDEN)

        # Satu GROUP BY untuk seluruh workspace, lalu arah bolak-balik digabung
        # jadi satu pasangan di Python. Tanpa penggabungan itu, obrolan A ke B
        # dan B ke A tampil sebagai dua baris terpisah.
        arah = (
            PesanLangsung.objects.filter(workspace__slug=slug)
            .values("pengirim_id", "penerima_id")
            .annotate(jumlah=Count("id"), terakhir=Max("created_at"))
        )

        pasangan = {}
        for baris in arah:
            kunci = tuple(sorted([str(baris["pengirim_id"]), str(baris["penerima_id"])]))
            ada = pasangan.get(kunci)
            if ada is None:
                pasangan[kunci] = {
                    "orang": list(kunci),
                    "jumlah": baris["jumlah"],
                    "terakhir": baris["terakhir"],
                }
            else:
                ada["jumlah"] += baris["jumlah"]
                ada["terakhir"] = max(ada["terakhir"], baris["terakhir"])

        hasil = sorted(pasangan.values(), key=lambda b: b["terakhir"], reverse=True)
        logger.info(
            "pengawasan-chat: %s membuka daftar percakapan workspace %s (%s pasangan)",
            request.user.email,
            slug,
            len(hasil),
        )
        return Response(hasil, status=status.HTTP_200_OK)


class ChatPengawasanThreadEndpoint(BaseAPIView):
    """Isi percakapan antara dua orang mana pun, untuk pemilik instance."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, user_a, user_b):
        if not _pengawas(request, slug):
            return Response({"error": "Hanya pemilik workspace."}, status=status.HTTP_403_FORBIDDEN)

        pesan = (
            PesanLangsung.objects.filter(workspace__slug=slug)
            .filter(
                Q(pengirim_id=user_a, penerima_id=user_b) | Q(pengirim_id=user_b, penerima_id=user_a)
            )
            .order_by("-created_at")[:JUMLAH_PESAN_PENGAWASAN]
        )
        logger.info(
            "pengawasan-chat: %s membaca percakapan %s dengan %s",
            request.user.email,
            user_a,
            user_b,
        )
        # `saya_id` sengaja None: di layar pengawasan tidak ada "pesan saya",
        # dan tidak ada pesan yang perlu ditandai baru.
        return Response([_bentuk(p) for p in reversed(list(pesan))], status=status.HTTP_200_OK)


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
        isi = [_bentuk(p, request.user.id) for p in reversed(list(pesan))]

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
        return Response(_bentuk(pesan, request.user.id), status=status.HTTP_201_CREATED)
