# Kustomisasi Paradise Task Tracker: pesan langsung antar-karyawan (Yorukaze Production)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Yang diuji hanya bagian yang bisa diam-diam salah.

Bukan "apakah pesan tersimpan", itu satu baris ORM. Yang diuji: kueri DISTINCT ON
yang meringkas percakapan, dan pemeriksaan penerima di sisi server. Dua-duanya
gagal tanpa suara kalau rusak: yang pertama menampilkan daftar yang tampak wajar
tapi salah orang, yang kedua baru terlihat setelah ada yang mencobanya.
"""

from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from plane.db.models import PesanLangsung, User, Workspace, WorkspaceMember


def _pesan(workspace, dari, ke, isi, menit_lalu):
    """Buat pesan dengan waktu yang pasti berbeda.

    `created_at` memakai auto_now_add, jadi tiga pesan yang dibuat dalam satu
    tarikan napas bisa berbagi mikrodetik yang sama dan urutannya jadi undian.
    Ditimpa lewat update supaya urutan yang diuji memang urutan yang dimaksud.
    """
    pesan = PesanLangsung.objects.create(workspace=workspace, pengirim=dari, penerima=ke, isi=isi)
    PesanLangsung.objects.filter(pk=pesan.pk).update(created_at=timezone.now() - timedelta(minutes=menit_lalu))
    return pesan


def _orang(nama):
    # `username` unik dan TIDAK boleh dikosongkan: dua User tanpa username
    # menabrak users_username_key, dan galatnya menunjuk ke baris kedua,
    # bukan ke sebabnya.
    return User.objects.create(
        id=uuid4(), username=nama, email=f"{nama}@paradise.test", display_name=nama, is_active=True
    )


@pytest.fixture
def kantor(db):
    """Satu workspace berisi tiga orang.

    Memakai ORM langsung, bukan plane.tests.factories: factory_boy adalah
    dependensi pengembangan dan tidak ada di image runtime, jadi uji ini akan
    gagal impor di container padahal isinya tidak salah apa-apa.
    """
    pemilik = _orang("aku")
    workspace = Workspace.objects.create(id=uuid4(), name="Kantor", slug="kantor-uji", owner=pemilik)
    budi = _orang("budi")
    citra = _orang("citra")
    for satu in (pemilik, budi, citra):
        WorkspaceMember.objects.create(workspace=workspace, member=satu, role=20)
    return workspace, pemilik, budi, citra


@pytest.mark.unit
class TestChat:
    @pytest.mark.django_db
    def test_percakapan_satu_baris_per_lawan_bicara(self, kantor):
        workspace, aku, budi, citra = kantor
        _pesan(workspace, budi, aku, "halo", menit_lalu=10)
        _pesan(workspace, aku, budi, "hai", menit_lalu=5)
        _pesan(workspace, budi, aku, "apa kabar", menit_lalu=1)
        _pesan(workspace, citra, aku, "titip berkas ya", menit_lalu=30)

        client = APIClient()
        client.force_authenticate(user=aku)
        res = client.get(f"/api/workspaces/{workspace.slug}/chat/")

        assert res.status_code == 200
        # Empat pesan, dua lawan bicara. Kalau DISTINCT ON hilang, ini jadi 4.
        assert len(res.data) == 2
        # Budi lebih dulu karena pesannya paling baru, meski Citra lebih dulu masuk.
        budi_baris, citra_baris = res.data
        assert budi_baris["lawan_bicara"] == str(budi.id)
        assert budi_baris["isi"] == "apa kabar"
        assert budi_baris["dari_saya"] is False
        assert budi_baris["belum_dibaca"] == 2
        assert citra_baris["lawan_bicara"] == str(citra.id)
        assert citra_baris["belum_dibaca"] == 1

    @pytest.mark.django_db
    def test_membuka_percakapan_menandai_terbaca(self, kantor):
        workspace, aku, budi, _ = kantor
        _pesan(workspace, budi, aku, "halo", menit_lalu=2)

        client = APIClient()
        client.force_authenticate(user=aku)
        assert client.get(f"/api/workspaces/{workspace.slug}/chat/{budi.id}/").status_code == 200

        assert PesanLangsung.objects.filter(penerima=aku, dibaca_pada__isnull=True).count() == 0
        # Yang ditandai hanya pesan MASUK. Pesan keluar milik lawan bicara.
        assert PesanLangsung.objects.filter(pengirim=aku, dibaca_pada__isnull=False).count() == 0

    @pytest.mark.django_db
    def test_penanda_baru_dihitung_sebelum_ditandai_terbaca(self, kantor):
        """UI memakai `baru` untuk menarik garis "pesan belum dibaca".

        Kalau penandanya dihitung SESUDAH UPDATE terbaca jalan, semuanya sudah
        terbaca dan garis itu tidak akan pernah muncul untuk siapa pun. Gagalnya
        senyap: responsnya tetap 200 dan pesannya tetap lengkap.
        """
        workspace, aku, budi, _ = kantor
        _pesan(workspace, aku, budi, "punyaku", menit_lalu=3)
        _pesan(workspace, budi, aku, "punya budi", menit_lalu=2)

        client = APIClient()
        client.force_authenticate(user=aku)
        res = client.get(f"/api/workspaces/{workspace.slug}/chat/{budi.id}/")

        assert [p["baru"] for p in res.data] == [False, True]
        # Muatan kedua: sudah terbaca, jadi tidak ada lagi yang ditandai baru.
        res2 = client.get(f"/api/workspaces/{workspace.slug}/chat/{budi.id}/")
        assert [p["baru"] for p in res2.data] == [False, False]

    @pytest.mark.django_db
    def test_jumlah_belum_dibaca_hanya_menghitung_pesan_masuk(self, kantor):
        workspace, aku, budi, citra = kantor
        _pesan(workspace, budi, aku, "satu", menit_lalu=3)
        _pesan(workspace, citra, aku, "dua", menit_lalu=2)
        # Pesan KELUAR tidak boleh ikut terhitung. Kalau filternya salah arah,
        # lencana sidebar akan menghitung pesan yang kita kirim sendiri.
        _pesan(workspace, aku, budi, "tiga", menit_lalu=1)

        client = APIClient()
        client.force_authenticate(user=aku)
        res = client.get(f"/api/workspaces/{workspace.slug}/chat/belum-dibaca/")

        assert res.status_code == 200
        assert res.data["jumlah"] == 2

        # Membuka percakapan dengan Budi menurunkan hitungannya, bukan menolkan.
        client.get(f"/api/workspaces/{workspace.slug}/chat/{budi.id}/")
        assert client.get(f"/api/workspaces/{workspace.slug}/chat/belum-dibaca/").data["jumlah"] == 1

    @pytest.mark.django_db
    def test_tidak_bisa_mengirim_ke_orang_di_luar_workspace(self, kantor):
        workspace, aku, _, _ = kantor
        orang_luar = _orang("dewi")

        client = APIClient()
        client.force_authenticate(user=aku)
        res = client.post(f"/api/workspaces/{workspace.slug}/chat/{orang_luar.id}/", {"isi": "hai"})

        assert res.status_code == 404
        assert PesanLangsung.objects.count() == 0

    @pytest.mark.django_db
    def test_pengawasan_ditolak_untuk_yang_bukan_pemilik(self, kantor):
        """Ini penjaga utama fitur pengawasan.

        Kalau rusak, seluruh isi obrolan 79 orang terbuka untuk anggota biasa,
        dan tidak ada gejala apa pun di layar yang menandakannya.
        """
        workspace, aku, budi, citra = kantor
        _pesan(workspace, budi, citra, "obrolan orang lain", menit_lalu=5)

        client = APIClient()
        client.force_authenticate(user=budi)  # anggota biasa, bukan pemilik
        daftar = client.get(f"/api/workspaces/{workspace.slug}/chat/pengawasan/")
        isi = client.get(f"/api/workspaces/{workspace.slug}/chat/pengawasan/{budi.id}/{citra.id}/")

        assert daftar.status_code == 403
        assert isi.status_code == 403

    @pytest.mark.django_db
    def test_pemilik_melihat_percakapan_orang_lain_tanpa_menandai_terbaca(self, kantor):
        workspace, aku, budi, citra = kantor
        _pesan(workspace, budi, citra, "halo citra", menit_lalu=5)
        _pesan(workspace, citra, budi, "halo budi", menit_lalu=4)

        client = APIClient()
        client.force_authenticate(user=aku)  # pemilik workspace
        daftar = client.get(f"/api/workspaces/{workspace.slug}/chat/pengawasan/")

        assert daftar.status_code == 200
        # Dua arah digabung jadi SATU pasangan, bukan dua baris.
        assert len(daftar.data) == 1
        assert daftar.data[0]["jumlah"] == 2
        assert sorted(daftar.data[0]["orang"]) == sorted([str(budi.id), str(citra.id)])

        isi = client.get(f"/api/workspaces/{workspace.slug}/chat/pengawasan/{budi.id}/{citra.id}/")
        assert isi.status_code == 200
        assert [p["isi"] for p in isi.data] == ["halo citra", "halo budi"]

        # Yang diawasi tidak boleh kehilangan tanda "belum dibaca" gara-gara
        # dibaca pengawas.
        assert PesanLangsung.objects.filter(dibaca_pada__isnull=True).count() == 2

    @pytest.mark.django_db
    def test_pesan_kosong_ditolak(self, kantor):
        workspace, aku, budi, _ = kantor

        client = APIClient()
        client.force_authenticate(user=aku)
        res = client.post(f"/api/workspaces/{workspace.slug}/chat/{budi.id}/", {"isi": "   "})

        assert res.status_code == 400
        assert PesanLangsung.objects.count() == 0
