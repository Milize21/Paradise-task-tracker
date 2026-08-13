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
from django.utils.dateparse import parse_datetime

# Third Party imports
from django.http import HttpResponseRedirect
from rest_framework import status
from rest_framework.response import Response

from plane.settings.storage import S3Storage

# Module imports
from plane.app.permissions import WorkspaceEntityPermission
from plane.db.models import BATAS_ISI, FileAsset, PesanLangsung, ReaksiPesan, Workspace, WorkspaceMember

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


# Berapa lampiran boleh menempel pada satu pesan.
BATAS_LAMPIRAN = 5


def _peta_lampiran(pesan_ids, slug):
    """Lampiran seluruh pesan dalam SATU kueri, dikelompokkan per pesan.

    Tanpa ini, merender 100 pesan berarti 100 kueri lampiran. Kuncinya
    `entity_identifier`, yang sudah ter-indeks bersama `entity_type`.
    """
    peta = {}
    aset = FileAsset.objects.filter(
        entity_type=FileAsset.EntityTypeContext.CHAT_ATTACHMENT,
        entity_identifier__in=[str(i) for i in pesan_ids],
        is_uploaded=True,
    )
    for a in aset:
        peta.setdefault(a.entity_identifier, []).append(
            {
                "id": str(a.id),
                "nama": a.attributes.get("name", ""),
                "tipe": a.attributes.get("type", ""),
                "ukuran": a.size,
                # URL berpenjaga milik Obrolan, BUKAN /assets/v2/static/ yang
                # AllowAny. Yang statis itu memang hanya melayani avatar dan
                # logo, dan memang seharusnya begitu.
                "url": f"/api/workspaces/{slug}/chat/lampiran/{a.id}/",
            }
        )
    return peta


def _peta_reaksi(pesan_ids):
    """Reaksi seluruh pesan dalam satu kueri, dikelompokkan per pesan lalu per
    emoji, berikut siapa saja yang memberikannya."""
    peta = {}
    for r in ReaksiPesan.objects.filter(pesan_id__in=pesan_ids).values("pesan_id", "emoji", "user_id"):
        baris = peta.setdefault(str(r["pesan_id"]), {})
        baris.setdefault(r["emoji"], []).append(str(r["user_id"]))
    return {
        pid: [{"emoji": e, "orang": orang} for e, orang in emoji.items()]
        for pid, emoji in peta.items()
    }


def _peta_kutipan(pesan_list):
    """Cuplikan pesan yang dibalas, satu kueri untuk semuanya."""
    induk_ids = {p.balasan_ke_id for p in pesan_list if p.balasan_ke_id}
    if not induk_ids:
        return {}
    induk = PesanLangsung.objects.filter(id__in=induk_ids).values("id", "isi", "pengirim_id")
    return {
        str(i["id"]): {
            "id": str(i["id"]),
            "pengirim": str(i["pengirim_id"]),
            # Dipotong di server: yang dibutuhkan UI cuma cuplikan, dan
            # mengirim pesan panjang dua kali membengkakkan tiap muatan.
            "isi": (i["isi"] or "")[:120],
        }
        for i in induk
    }


def _bentuk(pesan, slug, saya_id=None, lampiran=None, reaksi=None, dikutip=None):
    return {
        "id": str(pesan.id),
        "pengirim": str(pesan.pengirim_id),
        "isi": pesan.isi,
        "created_at": pesan.created_at,
        "lampiran": lampiran or [],
        "disunting": pesan.disunting_pada is not None,
        # Hanya berarti untuk pesan KELUAR: pengirim ingin tahu sudah dibaca
        # atau belum. Untuk pesan masuk nilainya tidak dipakai UI.
        "sudah_dibaca": pesan.dibaca_pada is not None,
        "balasan_ke": dikutip,
        "reaksi": reaksi or [],
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


class ChatPesanEndpoint(BaseAPIView):
    """Sunting, hapus, dan reaksi pada SATU pesan."""

    permission_classes = [WorkspaceEntityPermission]

    def _pesan_saya(self, request, slug, pesan_id):
        """Pesan yang boleh DIUBAH: hanya milik pengirimnya sendiri.

        Pemilik workspace sengaja TIDAK diberi jalan masuk ke sini. Mengawasi
        adalah membaca; mengubah tulisan orang lain adalah hal yang sama sekali
        berbeda, dan tidak pernah diminta.
        """
        return PesanLangsung.objects.filter(id=pesan_id, workspace__slug=slug, pengirim=request.user).first()

    def patch(self, request, slug, pesan_id):
        pesan = self._pesan_saya(request, slug, pesan_id)
        if pesan is None:
            return Response({"error": "Bukan pesan Anda."}, status=status.HTTP_404_NOT_FOUND)

        isi = (request.data.get("isi") or "").strip()
        if not isi:
            return Response({"error": "Pesan kosong."}, status=status.HTTP_400_BAD_REQUEST)
        if len(isi) > BATAS_ISI:
            return Response(
                {"error": f"Pesan terlalu panjang, maksimum {BATAS_ISI} karakter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pesan.isi = isi
        pesan.disunting_pada = timezone.now()
        pesan.save(update_fields=["isi", "disunting_pada", "updated_at"])
        peta = _peta_lampiran([pesan.id], slug)
        return Response(
            _bentuk(pesan, slug, request.user.id, peta.get(str(pesan.id))),
            status=status.HTTP_200_OK,
        )

    def delete(self, request, slug, pesan_id):
        pesan = self._pesan_saya(request, slug, pesan_id)
        if pesan is None:
            return Response({"error": "Bukan pesan Anda."}, status=status.HTTP_404_NOT_FOUND)
        # Soft delete: barisnya tetap ada untuk audit, tapi hilang dari semua
        # daftar karena manager bawaan menyaring deleted_at.
        pesan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChatReaksiEndpoint(BaseAPIView):
    """Tambah atau buang satu reaksi emoji pada pesan di percakapan sendiri."""

    permission_classes = [WorkspaceEntityPermission]

    def post(self, request, slug, pesan_id):
        emoji = (request.data.get("emoji") or "").strip()
        if not emoji or len(emoji) > 32:
            return Response({"error": "Emoji tidak sah."}, status=status.HTTP_400_BAD_REQUEST)

        # Boleh bereaksi hanya pada percakapan yang kita ikuti, bukan pada
        # sembarang id pesan yang ditebak.
        pesan = PesanLangsung.objects.filter(id=pesan_id, workspace__slug=slug).filter(
            Q(pengirim=request.user) | Q(penerima=request.user)
        ).first()
        if pesan is None:
            return Response({"error": "Pesan tidak ditemukan."}, status=status.HTTP_404_NOT_FOUND)

        ada = ReaksiPesan.objects.filter(pesan=pesan, user=request.user, emoji=emoji).first()
        if ada:
            # Klik kedua pada emoji yang sama = membatalkan. Satu endpoint untuk
            # dua arah, karena dari sisi UI ini memang satu tombol.
            ada.delete(soft=False)
            return Response({"aktif": False}, status=status.HTTP_200_OK)

        ReaksiPesan.objects.create(pesan=pesan, user=request.user, emoji=emoji)
        return Response({"aktif": True}, status=status.HTTP_201_CREATED)


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
        urut = list(reversed(list(pesan)))
        peta = _peta_lampiran([p.id for p in urut], slug)
        reaksi = _peta_reaksi([p.id for p in urut])
        kutipan = _peta_kutipan(urut)
        return Response(
            [
                _bentuk(
                    p,
                    slug,
                    None,
                    peta.get(str(p.id)),
                    reaksi.get(str(p.id)),
                    kutipan.get(str(p.balasan_ke_id)) if p.balasan_ke_id else None,
                )
                for p in urut
            ],
            status=status.HTTP_200_OK,
        )


def boleh_lihat_lampiran(user, aset, slug) -> bool:
    """Penjaga tunggal lampiran obrolan.

    Satu fungsi, dipakai endpoint Obrolan MAUPUN endpoint unduhan bawaan, supaya
    tidak ada pintu belakang. Endpoint unduhan workspace bawaan melayani setiap
    anggota untuk aset apa pun; tanpa penjaga ini, id lampiran yang bocor sekali
    bisa dibuka siapa saja yang punya akun.
    """
    if aset.entity_type != FileAsset.EntityTypeContext.CHAT_ATTACHMENT:
        return True  # bukan urusan fungsi ini
    if not aset.entity_identifier:
        # Belum menempel ke pesan mana pun: hanya pengunggahnya.
        return aset.created_by_id == user.id
    pesan = PesanLangsung.objects.filter(id=aset.entity_identifier).first()
    if pesan is None:
        return False
    if user.id in (pesan.pengirim_id, pesan.penerima_id):
        return True
    # Pemilik workspace, jalur yang sama dengan layar pengawasan.
    return Workspace.objects.filter(slug=slug, owner=user).exists()


class ChatLampiranEndpoint(BaseAPIView):
    """Unduh satu lampiran obrolan, hanya untuk pihak yang berhak."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, asset_id):
        aset = FileAsset.objects.filter(
            id=asset_id,
            workspace__slug=slug,
            entity_type=FileAsset.EntityTypeContext.CHAT_ATTACHMENT,
            is_uploaded=True,
        ).first()
        if aset is None:
            return Response({"error": "Lampiran tidak ditemukan."}, status=status.HTTP_404_NOT_FOUND)

        if not boleh_lihat_lampiran(request.user, aset, slug):
            logger.warning(
                "lampiran-chat: %s DITOLAK membuka lampiran %s",
                request.user.email,
                asset_id,
            )
            return Response({"error": "Bukan lampiran Anda."}, status=status.HTTP_403_FORBIDDEN)

        storage = S3Storage(request=request)
        # `inline` supaya gambar dan video tampil di dalam percakapan, bukan
        # terunduh sebagai berkas tiap kali dilihat.
        signed = storage.generate_presigned_url(
            object_name=aset.asset.name,
            disposition="inline",
            filename=aset.attributes.get("name", "lampiran"),
        )
        return HttpResponseRedirect(signed)


class ChatThreadEndpoint(BaseAPIView):
    """Isi percakapan dengan satu orang, dan pengiriman pesan baru."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, user_id):
        antara = PesanLangsung.objects.filter(workspace__slug=slug).filter(
            Q(pengirim=request.user, penerima_id=user_id) | Q(pengirim_id=user_id, penerima=request.user)
        )
        # `sebelum` = penggulungan ke belakang. Memakai cap waktu, bukan nomor
        # halaman: pesan baru terus berdatangan di ujung lain, dan nomor halaman
        # akan bergeser di bawah jari orang yang sedang menggulung.
        sebelum = request.query_params.get("sebelum")
        if sebelum:
            # Diurai eksplisit. Kalau nilainya diserahkan langsung ke filter,
            # format yang tidak dikenal keluar sebagai 400 mentah dari Django
            # tanpa keterangan apa pun, dan yang memanggil tidak tahu apa yang
            # salah.
            batas = parse_datetime(sebelum)
            if batas is None:
                return Response(
                    {"error": "Parameter `sebelum` harus waktu ISO 8601."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            antara = antara.filter(created_at__lt=batas)

        pesan = antara.order_by("-created_at")[:JUMLAH_PESAN]
        # Diambil menurun supaya yang terpotong adalah pesan TERTUA, lalu
        # dibalik supaya peramban menerimanya urut waktu.
        urut = list(reversed(list(pesan)))
        peta = _peta_lampiran([p.id for p in urut], slug)
        reaksi = _peta_reaksi([p.id for p in urut])
        kutipan = _peta_kutipan(urut)
        isi = [
            _bentuk(
                p,
                slug,
                request.user.id,
                peta.get(str(p.id)),
                reaksi.get(str(p.id)),
                kutipan.get(str(p.balasan_ke_id)) if p.balasan_ke_id else None,
            )
            for p in urut
        ]

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
        lampiran_ids = request.data.get("lampiran") or []
        if not isinstance(lampiran_ids, list) or len(lampiran_ids) > BATAS_LAMPIRAN:
            return Response(
                {"error": f"Lampiran maksimum {BATAS_LAMPIRAN} berkas."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Kosong hanya ditolak kalau lampirannya juga kosong. Mengirim gambar
        # tanpa keterangan apa pun itu hal yang wajar dilakukan orang.
        if not isi and not lampiran_ids:
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

        # Yang boleh dikutip hanya pesan dari percakapan INI. Tanpa saringan
        # itu, id pesan orang lain bisa dikutip dan cuplikannya ikut terbaca.
        balasan_ke_id = request.data.get("balasan_ke")
        if balasan_ke_id:
            sah = PesanLangsung.objects.filter(
                id=balasan_ke_id, workspace__slug=slug
            ).filter(
                Q(pengirim=request.user, penerima_id=user_id) | Q(pengirim_id=user_id, penerima=request.user)
            ).exists()
            if not sah:
                balasan_ke_id = None

        pesan = PesanLangsung.objects.create(
            workspace_id=anggota.workspace_id,
            pengirim=request.user,
            penerima_id=user_id,
            isi=isi,
            balasan_ke_id=balasan_ke_id,
        )

        if lampiran_ids:
            # Yang boleh ditempel HANYA berkas yang diunggah orang ini sendiri,
            # di workspace ini, bertipe lampiran obrolan, dan belum menempel di
            # pesan mana pun. Tanpa keempatnya, id berkas milik orang lain bisa
            # ditempelkan ke pesan sendiri lalu isinya ikut terbaca.
            terpakai = FileAsset.objects.filter(
                id__in=lampiran_ids,
                workspace__slug=slug,
                created_by=request.user,
                entity_type=FileAsset.EntityTypeContext.CHAT_ATTACHMENT,
                entity_identifier__isnull=True,
            ).update(entity_identifier=str(pesan.id))
            if terpakai != len(lampiran_ids):
                logger.warning(
                    "lampiran-chat: %s mengirim %s id, hanya %s yang sah",
                    request.user.email,
                    len(lampiran_ids),
                    terpakai,
                )

        peta = _peta_lampiran([pesan.id], slug)
        kutipan = _peta_kutipan([pesan])
        return Response(
            _bentuk(
                pesan,
                slug,
                request.user.id,
                peta.get(str(pesan.id)),
                None,
                kutipan.get(str(pesan.balasan_ke_id)) if pesan.balasan_ke_id else None,
            ),
            status=status.HTTP_201_CREATED,
        )
