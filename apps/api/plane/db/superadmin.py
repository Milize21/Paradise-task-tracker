# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker — Super Admin tersembunyi (Yorukaze Production)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""Super Admin: akses ke semua project tanpa perlu di-assign, dan tidak terlihat.

Yang diminta: Super Admin (instance admin / God Mode) bisa memantau dan
mengerjakan apa pun di seluruh project — termasuk project yang baru dibuat —
tanpa ditambahkan manual, dan **keberadaannya tidak terlihat** oleh user maupun
admin project.

## Kenapa lewat keanggotaan otomatis, bukan menembus lapisan izin

Plane menentukan akses lewat keanggotaan: **33 berkas** menyaring queryset
dengan `project__project_projectmember__member=request.user`. Menambahkan jalan
pintas di lapisan izin berarti menyentuh ketiga puluh tiga tempat itu, dan satu
kondisi yang salah tulis di antaranya membuka akses ke orang yang salah — pada
instance berisi 79 orang.

Jadi Super Admin tetap PUNYA baris `ProjectMember`, dibuatkan otomatis, lalu
**disaring keluar dari setiap daftar anggota**. Hasil yang dilihat orang persis
sama dengan yang diminta, tanpa membongkar lapisan izin.

> **Batas yang harus disadari:** ini menyembunyikan di lapisan tampilan, bukan
> di penyimpanan. Barisnya tetap ada di tabel `project_members`. Siapa pun yang
> bisa membaca database langsung akan melihatnya — dan itu wajar, karena orang
> yang punya akses database sudah punya akses ke segalanya.

## Kapan keanggotaan dibuat

1. **Project baru dibuat** → seluruh Super Admin ikut ditambahkan.
2. **Super Admin baru diangkat** → ia ditambahkan ke seluruh project yang ada.

Keduanya lewat signal, bukan dipanggil dari view, supaya jalur pembuatan project
mana pun (API, skrip, shell) ikut tercakup.
"""

# Django imports
from django.db.models.signals import post_save
from django.dispatch import receiver


def super_admin_user_ids():
    """Id user yang berstatus instance admin (Super Admin).

    Diimpor di dalam fungsi: `plane.license` memuat model dari `plane.db`, jadi
    impor di tingkat modul akan melingkar saat app dimuat.
    """
    from plane.license.models import InstanceAdmin

    return set(InstanceAdmin.objects.values_list("user_id", flat=True))


def sembunyikan(queryset, field="member_id"):
    """Buang Super Admin dari queryset keanggotaan mana pun.

    Dipakai semua endpoint yang mengembalikan daftar anggota. Satu fungsi supaya
    kalau kelak ada daftar baru, cukup dipanggil — bukan disalin logikanya.
    """
    ids = super_admin_user_ids()
    return queryset.exclude(**{f"{field}__in": ids}) if ids else queryset


def _tambahkan_ke_project(user_ids, projects):
    """Jadikan anggota project, tanpa menggandakan baris yang sudah ada.

    Memakai `all_objects`, BUKAN manager bawaan. Manager bawaan menyaring habis
    baris ber-`deleted_at`, jadi keanggotaan yang pernah dicabut tidak terlihat
    dan `get_or_create` akan membuat baris BARU untuk pasangan user+project yang
    sama. Itu langsung menabrak constraint unik `ProjectUserProperty` yang
    dibuat signal Plane saat ProjectMember lahir — dan gagalnya baru muncul
    beberapa project kemudian, jauh dari sebabnya.

    Keanggotaan yang pernah dicabut **dihidupkan kembali**, bukan digandakan.
    """
    from plane.db.models import ProjectMember

    dibuat = dipulihkan = 0
    for p in projects:
        for uid in user_ids:
            pm = ProjectMember.all_objects.filter(project=p, member_id=uid).first()
            if pm is None:
                ProjectMember.objects.create(
                    project=p, member_id=uid, workspace_id=p.workspace_id, role=20
                )
                dibuat += 1
            elif pm.deleted_at is not None or not pm.is_active or pm.role != 20:
                pm.deleted_at = None
                pm.is_active = True
                pm.role = 20
                pm.save(update_fields=["deleted_at", "is_active", "role"])
                dipulihkan += 1
    return dibuat + dipulihkan


@receiver(post_save, sender="db.Project")
def project_baru_untuk_super_admin(sender, instance, created, **kwargs):
    """Project baru → semua Super Admin langsung punya akses."""
    if not created:
        return
    ids = super_admin_user_ids()
    if ids:
        _tambahkan_ke_project(ids, [instance])


def sinkronkan_super_admin(user_id=None):
    """Pastikan Super Admin jadi anggota SELURUH project yang ada.

    Dipanggil setelah mengangkat Super Admin baru. Aman dijalankan ulang —
    `get_or_create`, jadi tidak menggandakan.
    """
    from plane.db.models import Project

    ids = {user_id} if user_id else super_admin_user_ids()
    if not ids:
        return 0
    return _tambahkan_ke_project(ids, Project.objects.filter(deleted_at__isnull=True))
