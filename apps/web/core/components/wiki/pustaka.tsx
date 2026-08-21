/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: pustaka Wiki (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ArrowLeft, Lock, Plus, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import useSWR from "swr";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage } from "@plane/types";
import { getPageName, renderFormattedDate } from "@plane/utils";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useMember } from "@/hooks/store/use-member";
import { useAppRouter } from "@/hooks/use-app-router";
// services
import { WikiAccessService, type TWikiFolderPermission } from "@/services/wiki_access.service";
// local imports
import { KartuFolder, KartuKerangka, KartuMateri } from "./kartu";

const layanan = new WikiAccessService();

/**
 * Wiki sebagai PUSTAKA, bukan tumpukan memo.
 *
 * Bentuknya tiga tingkat, Divisi -> Topik -> Materi, dan ketiganya tetap berupa
 * `Page` biasa dengan `parent`. Tidak ada tabel baru dan tidak ada sistem izin
 * kedua: resolver ACL di server memang selalu menelusuri naik ke folder
 * teratas, jadi Materi di dalam Topik tetap dinilai terhadap Divisinya tanpa
 * satu baris pun perubahan izin.
 *
 * Yang berpindah cuma cara melihatnya. Daftar baris berindentasi menjawab
 * "apa saja yang ada di sini"; kartu bersampul menjawab "aku mau belajar apa
 * hari ini", dan itu pertanyaan yang sebenarnya dibawa orang ke Wiki.
 *
 * Tingkat kedalaman TIDAK dipakai untuk menentukan bentuk kartu, kecuali di
 * tingkat teratas. Yang dipakai adalah "punya anak atau tidak". Dengan begitu
 * divisi yang cukup dua tingkat (Divisi -> Materi) tidak dipaksa membuat Topik
 * kosong hanya demi bentuk, dan folder yang isinya belum ada tetap bisa dibuka
 * sebagai halaman biasa alih-alih jadi jalan buntu.
 */
type TProps = {
  workspaceSlug: string;
  projectId: string;
};

export const PustakaWiki = observer(function PustakaWiki({ workspaceSlug, projectId }: TProps) {
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("folder");
  const router = useAppRouter();
  const [sedangMembuat, setSedangMembuat] = useState(false);
  // store hooks
  const {
    createPage,
    fetchPagesList,
    filters,
    getCurrentProjectFilteredPageIdsByTab,
    getCurrentProjectRootPageIdsByTab,
    getPageById,
    getSubPageIds,
    loader,
    updateFilters,
  } = usePageStore(EPageStoreType.PROJECT);
  const { getUserDetails } = useMember();

  // Kunci SWR-nya sengaja sama dengan halaman daftar dan halaman detail, jadi
  // seluruh pohon diambil sekali dan dipakai bertiga.
  useSWR(
    workspaceSlug && projectId ? `PROJECT_PAGES_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchPagesList(workspaceSlug, projectId, "public") : null
  );
  const { data: izin } = useSWR(
    workspaceSlug && projectId ? `WIKI_PERMISSIONS_${projectId}` : null,
    workspaceSlug && projectId ? () => layanan.fetchPermissions(workspaceSlug, projectId) : null,
    { revalidateOnFocus: false }
  );

  const izinFolder = useMemo(() => {
    const peta = new Map<string, TWikiFolderPermission>();
    izin?.folders.forEach((f) => peta.set(f.id, f));
    return peta;
  }, [izin]);

  const kueri = filters.searchQuery.trim();
  const sedangMencari = kueri.length > 0;

  // Tautan ditulis lengkap, bukan relatif seperti `?folder=x`. Resolusi relatif
  // di react-router bergantung pada bentuk rutenya, dan satu tautan yang salah
  // resolusi di sini artinya seluruh Wiki tidak bisa ditelusuri.
  const beranda = `/${workspaceSlug}/projects/${projectId}/pages/`;
  const keFolder = (id: string) => `${beranda}?folder=${id}`;

  /** Naik ke folder teratas. Di situlah izin dan nama divisinya menempel. */
  const folderTeratas = (pageId: string): string => {
    let kini = pageId;
    for (let i = 0; i < 20; i++) {
      const induk = getPageById(kini)?.parent;
      if (!induk) return kini;
      kini = induk;
    }
    return kini;
  };

  const jejak = (pageId: string): string[] => {
    const nama: string[] = [];
    let kini = getPageById(pageId)?.parent ?? undefined;
    for (let i = 0; i < 20 && kini; i++) {
      const halaman = getPageById(kini);
      if (!halaman) break;
      nama.unshift(getPageName(halaman.name));
      kini = halaman.parent ?? undefined;
    }
    return nama;
  };

  const folder = folderId ? getPageById(folderId) : undefined;
  const akar = getCurrentProjectRootPageIdsByTab("public");
  const divisiIds = useMemo(
    () => (sedangMencari ? [] : (akar ?? []).filter((id) => !getPageById(id)?.parent)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [akar, sedangMencari]
  );

  const daftar = sedangMencari
    ? (getCurrentProjectFilteredPageIdsByTab("public") ?? [])
    : folderId
      ? getSubPageIds(folderId, "public")
      : (akar ?? []);

  const izinFolderKini = folderId ? izinFolder.get(folderTeratas(folderId)) : undefined;
  const bolehUnggah = folderId ? !!izinFolderKini?.can_upload : !!izin?.is_project_admin;
  const diKedalaman = folder ? (folder.parent ? 2 : 1) : 0;
  const kataAnak = diKedalaman === 0 ? "Divisi" : diKedalaman === 1 ? "Topik" : "Materi";

  const buatEntri = async () => {
    if (sedangMembuat) return;
    setSedangMembuat(true);
    try {
      // Akses diwarisi dari induknya. Kalau tidak, materi di dalam folder
      // privat bisa lahir sebagai publik tanpa ada yang menyadarinya.
      const payload: Partial<TPage> = folderId ? { parent: folderId, access: folder?.access } : {};
      const halamanBaru = await createPage(payload);
      if (halamanBaru?.id) router.push(`/${workspaceSlug}/projects/${projectId}/pages/${halamanBaru.id}`);
    } catch (error) {
      const pesan = (error as { data?: { error?: string } })?.data?.error;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Gagal",
        message: pesan || `${kataAnak} baru gagal dibuat. Coba lagi.`,
      });
    } finally {
      setSedangMembuat(false);
    }
  };

  const kartu = (pageId: string) => {
    const halaman = getPageById(pageId);
    if (!halaman) return null;
    const judul = getPageName(halaman.name);
    const anak = getSubPageIds(pageId, "public");
    const teratas = folderTeratas(pageId);
    const izinTeratas = izinFolder.get(teratas);
    const adalahDivisi = !halaman.parent;
    const adalahFolder = adalahDivisi || anak.length > 0;

    if (adalahFolder) {
      const pemilik = izinTeratas?.divisions.map((d) => d.name).join(", ");
      return (
        <KartuFolder
          key={pageId}
          to={keFolder(pageId)}
          judul={judul}
          logoProps={halaman.logo_props}
          terbuka={adalahDivisi && izinTeratas?.is_general}
          keterangan={
            adalahDivisi
              ? izinTeratas?.is_general
                ? "Terbuka untuk semua karyawan"
                : pemilik
                  ? `Dikelola ${pemilik}`
                  : "Belum ada divisi pengelola"
              : `Diperbarui ${renderFormattedDate(halaman.updated_at)}`
          }
          jumlahAnak={anak.length}
          satuanAnak={adalahDivisi ? "Topik" : "Materi"}
        />
      );
    }

    const pengunggah = halaman.owned_by ? getUserDetails(halaman.owned_by)?.display_name : undefined;
    const jalur = sedangMencari ? jejak(pageId).join(" › ") : undefined;
    return (
      <KartuMateri
        key={pageId}
        to={`/${workspaceSlug}/projects/${projectId}/pages/${pageId}`}
        judul={judul}
        logoProps={halaman.logo_props}
        cap={izinTeratas?.divisions[0]?.identifier}
        keterangan={jalur || [pengunggah, renderFormattedDate(halaman.updated_at)].filter(Boolean).join(" · ")}
      />
    );
  };

  const sedangMemuat = loader === "init-loader" && daftar.length === 0;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      {/* Kepala: judul besar, keterangan, pencarian */}
      <div className="border-b border-subtle bg-surface-1 px-page-x py-8">
        {folder ? (
          <>
            <Link
              to={folder.parent ? keFolder(folder.parent) : beranda}
              className="inline-flex items-center gap-1.5 text-12 text-tertiary transition-colors hover:text-secondary"
            >
              <ArrowLeft className="size-3.5" />
              {folder.parent ? "Kembali ke divisinya" : "Kembali ke beranda Wiki"}
            </Link>
            <h1 className="text-3xl mt-3 font-semibold tracking-tight text-primary">{getPageName(folder.name)}</h1>
            <p className="mt-1 text-13 text-tertiary">
              {izinFolderKini?.is_general
                ? "Folder terbuka. Semua karyawan boleh menaruh materi di sini."
                : izinFolderKini?.divisions.length
                  ? `Dikelola ${izinFolderKini.divisions.map((d) => d.name).join(", ")}`
                  : "Belum ada divisi pengelola"}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight text-primary">Wiki Perusahaan</h1>
            <p className="mt-1 max-w-2xl text-13 text-tertiary">
              Panduan, SOP, dan materi tiap divisi. Semua orang boleh membaca. Yang menaruh materi baru hanya divisi
              pemilik foldernya, dan hanya pengunggahnya sendiri yang bisa mengubah atau menghapusnya.
            </p>
          </>
        )}

        <div className="relative mt-5 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-placeholder" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => updateFilters("searchQuery", e.target.value)}
            placeholder="Cari materi..."
            className="w-full rounded-full border border-subtle bg-layer-2 py-2 pr-3 pl-9 text-13 text-primary transition-colors outline-none placeholder:text-placeholder focus:border-accent-strong"
          />
        </div>

        {/* Pintasan divisi. Digulir mendatar di layar sempit, dengan penanda gulir. */}
        {!sedangMencari && !folderId && divisiIds.length > 0 && (
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 gulir-berpenanda">
            {divisiIds.map((id) => {
              const nama = getPageById(id)?.name;
              return (
                <Link
                  key={id}
                  to={keFolder(id)}
                  className="shrink-0 rounded-full border border-subtle bg-layer-2 px-3.5 py-1.5 text-12 text-secondary transition-colors hover:border-strong hover:text-primary"
                >
                  {getPageName(nama)}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Isi */}
      <div className="flex-1 px-page-x py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-15 font-semibold text-primary">
              {sedangMencari ? "Hasil pencarian" : folderId ? `Daftar ${kataAnak}` : "Pilih divisi"}
            </h2>
            <span className="rounded-full bg-layer-3 px-2 py-0.5 text-11 text-tertiary">
              {daftar.length} {sedangMencari ? "hasil" : kataAnak}
            </span>
          </div>

          {bolehUnggah ? (
            <Button variant="primary" size="sm" onClick={buatEntri} loading={sedangMembuat}>
              <Plus className="size-3.5" />
              {kataAnak} baru
            </Button>
          ) : (
            folderId && (
              <span className="inline-flex items-center gap-1.5 text-11 text-tertiary">
                <Lock className="size-3" />
                Hanya divisi pengelola yang bisa menambah
              </span>
            )
          )}
        </div>

        {sedangMemuat ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <KartuKerangka key={i} />
            ))}
          </div>
        ) : daftar.length === 0 ? (
          <div className="rounded-lg border border-dashed border-subtle px-6 py-14 text-center">
            <p className="text-14 font-medium text-secondary">
              {sedangMencari ? `Tidak ada materi yang cocok dengan "${kueri}"` : `Belum ada ${kataAnak} di sini`}
            </p>
            <p className="mt-1 text-12 text-tertiary">
              {sedangMencari
                ? "Pencarian mencocokkan judul materi, bukan isi dokumennya."
                : bolehUnggah
                  ? `Tekan "${kataAnak} baru" untuk mulai mengisinya.`
                  : "Divisi pengelola folder ini belum menaruh apa pun."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{daftar.map(kartu)}</div>
        )}
      </div>
    </div>
  );
});
