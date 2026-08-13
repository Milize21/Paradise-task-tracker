# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker: pesan langsung antar-karyawan (Yorukaze Production)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from .base import BaseModel

# Batas panjang satu pesan. Bukan batas teknis TextField, tapi batas kewarasan:
# tanpa ini satu tempelan berisi seluruh isi spreadsheet masuk ke tabel dan tiap
# pemuatan percakapan ikut menyeretnya.
BATAS_ISI = 5000


class PesanLangsung(BaseModel):
    """Satu pesan dari satu orang ke satu orang, di dalam satu workspace.

    TIDAK ADA model Percakapan, dan itu keputusan sadar. Untuk obrolan dua orang,
    "percakapan" sepenuhnya bisa diturunkan dari pasangan pengirim-penerima, jadi
    tabel kedua hanya menambah satu baris yang harus dibuat, dikunci, dan
    dibersihkan tanpa menyimpan satu fakta pun yang belum ada di sini.

    Konsekuensinya yang perlu diketahui lebih dulu: kalau nanti chat diperluas ke
    kanal per project (lebih dari dua peserta), model ini TIDAK bisa dipakai dan
    memang tidak dirancang untuk itu. Kanal butuh tabel ruang + keanggotaan, dan
    saat itu tiba yang benar adalah menambah model baru di samping model ini,
    bukan memaksa `penerima` jadi banyak.

    `dibaca_pada` ditaruh di pesan, bukan penanda "terakhir dibaca" di
    percakapan. Alasannya sama: tidak ada tabel percakapan yang bisa menampungnya,
    dan hitungan belum dibaca jadi satu COUNT beríndeks.
    """

    workspace = models.ForeignKey("db.Workspace", related_name="pesan_langsung", on_delete=models.CASCADE)
    pengirim = models.ForeignKey("db.User", related_name="pesan_terkirim", on_delete=models.CASCADE)
    penerima = models.ForeignKey("db.User", related_name="pesan_diterima", on_delete=models.CASCADE)
    isi = models.TextField()
    dibaca_pada = models.DateTimeField(null=True, blank=True)
    # Diisi saat pesan ini sudah pernah masuk email pemberitahuan. Ditaruh di
    # pesan, bukan di penerima, karena inilah yang membuat email tidak pernah
    # mengulang isi yang sama: penanda per-orang akan kehilangan jejak pesan
    # mana yang sudah diberitahukan begitu ada pesan baru menyusul.
    dinotifikasi_pada = models.DateTimeField(null=True, blank=True)
    # Diisi saat pesan disunting. Waktunya disimpan, bukan sekadar bendera:
    # penerima berhak tahu bahwa yang dibacanya bukan lagi kalimat yang
    # dikirim semula, dan kapan berubahnya.
    disunting_pada = models.DateTimeField(null=True, blank=True)
    # Pesan yang sedang dibalas. SET_NULL, bukan CASCADE: menghapus pesan yang
    # dikutip tidak boleh ikut menghapus balasannya, karena balasan itu milik
    # orang lain dan sering justru bagian yang penting.
    balasan_ke = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="balasan"
    )

    class Meta:
        verbose_name = "Pesan Langsung"
        verbose_name_plural = "Pesan Langsung"
        db_table = "direct_messages"
        ordering = ("-created_at",)
        # Nama indeks ditulis eksplisit. Kalau dikosongkan Django menurunkannya
        # dari hash, dan migrasi yang ditulis tangan akan selalu meleset satu
        # RenameIndex dari keadaan model. Itu persis yang terjadi di 0131.
        indexes = [
            models.Index(fields=["workspace", "pengirim", "penerima"], name="dm_ws_pengirim_penerima_idx"),
            models.Index(fields=["penerima", "dibaca_pada"], name="dm_penerima_dibaca_idx"),
        ]

    def __str__(self):
        return f"{self.pengirim_id} -> {self.penerima_id}"


class ReaksiPesan(BaseModel):
    """Satu reaksi emoji dari satu orang pada satu pesan.

    Tabel sendiri, bukan kolom JSON di pesan: reaksi ditambah dan dibuang oleh
    orang yang BERBEDA dari pemilik pesan, dan dua orang bisa bereaksi pada
    detik yang sama. Kolom JSON membuat keduanya saling menimpa, dan yang kalah
    hilang tanpa jejak.
    """

    pesan = models.ForeignKey("db.PesanLangsung", related_name="reaksi", on_delete=models.CASCADE)
    user = models.ForeignKey("db.User", related_name="reaksi_pesan", on_delete=models.CASCADE)
    # Disimpan sebagai karakter emoji, bukan kode desimal: yang membacanya cuma
    # UI, dan menyimpan kode berarti tiap pembaca harus tahu cara mengubahnya
    # kembali.
    emoji = models.CharField(max_length=32)

    class Meta:
        # Satu orang, satu emoji, satu pesan. Tanpa kunci ini, klik ganda
        # membuat reaksi kembar yang tidak bisa dibatalkan dari UI.
        unique_together = ["pesan", "user", "emoji", "deleted_at"]
        verbose_name = "Reaksi Pesan"
        verbose_name_plural = "Reaksi Pesan"
        db_table = "direct_message_reactions"
        ordering = ("created_at",)
        indexes = [models.Index(fields=["pesan"], name="dm_reaksi_pesan_idx")]

    def __str__(self):
        return f"{self.user_id} {self.emoji} {self.pesan_id}"
