/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: penampil Materi Wiki (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ArrowLeft, Download } from "lucide-react";
import { Link, useParams } from "react-router";
import useSWR from "swr";
import { renderFormattedDate } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// services
import { WikiMaterialService, type TPratinjauMateri } from "@/services/wiki_material.service";
// local imports
import { labelTipe, ukuranTerbaca, useProjectWiki } from "./data";

const layanan = new WikiMaterialService();

/**
 * Baca, tonton, buka. Di sini, bukan di aplikasi lain.
 *
 * Server yang memutuskan bentuk tampilannya lewat `kind`, bukan klien yang
 * menebak dari nama berkas, karena hanya server yang tahu apakah sebuah berkas
 * Office sudah berhasil dikonversi jadi PDF.
 *
 * Kalau memang tidak bisa ditampilkan, yang muncul kartu unduh BERIKUT
 * alasannya. Bingkai kosong yang tidak pernah memuat adalah kegagalan yang
 * lebih buruk, karena orang akan menunggunya.
 */
function Bingkai({ pratinjau }: { pratinjau: TPratinjauMateri }) {
  const { kind, url, title } = pratinjau;
  if (!url) return null;

  if (kind === "image")
    return <img src={url} alt={title} className="mx-auto max-h-[calc(100vh-16rem)] w-auto rounded-lg object-contain" />;

  if (kind === "video")
    return (
      // preload="metadata" saja: berkas bisa 250 MB, dan Range request sudah
      // terbukti jalan di produksi jadi orang bisa loncat ke menit berapa pun
      // tanpa mengunduh semuanya dulu.
      // oxlint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={url}
        controls
        preload="metadata"
        className="mx-auto max-h-[calc(100vh-16rem)] w-full rounded-lg bg-black"
      />
    );

  if (kind === "audio")
    // Takarir wajib menurut aturan a11y, dan itu benar untuk video yang KAMI
    // buat. Di sini berkasnya diunggah karyawan, jadi tidak ada berkas takarir
    // yang bisa ditunjuk. Memasang <track> kosong justru berbohong kepada
    // pembaca layar: ia akan mengumumkan takarir tersedia lalu tidak
    // memberikan apa pun. Jalan yang benar adalah fitur unggah takarir
    // tersendiri, dan itu belum diminta.
    // oxlint-disable-next-line jsx-a11y/media-has-caption
    return <audio src={url} controls className="w-full" />;

  return (
    <iframe
      src={url}
      title={title}
      // PDF SENGAJA tanpa sandbox: Chrome menolak memuat viewer PDF bawaannya
      // di dalam iframe ber-sandbox, apa pun kombinasi tokennya. Berkas teks
      // justru dikunci penuh, karena isinya datang dari unggahan orang.
      sandbox={kind === "pdf" ? undefined : ""}
      className="h-[calc(100vh-16rem)] w-full rounded-lg border border-subtle bg-layer-1"
    />
  );
}

function WikiMateriPage() {
  const { workspaceSlug, assetId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const idMateri = assetId?.toString() ?? "";
  const { projectId } = useProjectWiki();

  const { data, isLoading, error } = useSWR(
    projectId && idMateri ? `WIKI_MATERIAL_PREVIEW_${idMateri}` : null,
    projectId ? () => layanan.preview(slug, projectId, idMateri) : null,
    { revalidateOnFocus: false }
  );

  if (error)
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <h2 className="text-15 font-semibold text-primary">Materi ini tidak bisa dibuka</h2>
          <p className="mt-1 text-13 text-tertiary">
            {(error as { error?: string })?.error || "Kemungkinan ia sudah dihapus, atau kamu tidak punya akses."}
          </p>
          <Link
            to={`/${slug}/wiki`}
            className="mt-4 inline-block rounded-md border border-subtle px-3 py-1.5 text-12 font-medium text-secondary transition-colors hover:border-strong hover:text-primary"
          >
            Kembali ke Wiki
          </Link>
        </div>
      </div>
    );

  if (isLoading || !data)
    return (
      <div className="flex h-full w-full flex-col gap-4 px-page-x py-8">
        <div className="h-6 w-1/3 animate-pulse rounded bg-layer-3" />
        <div className="h-[60vh] w-full animate-pulse rounded-lg bg-layer-3" />
        <p className="text-center text-12 text-tertiary">
          Menyiapkan materi. Berkas Word, Excel, dan PowerPoint dikonversi dulu saat pertama kali dibuka, jadi yang ini
          bisa memakan beberapa detik.
        </p>
      </div>
    );

  return (
    <>
      <PageHead title={`${data.title} - Wiki`} />
      <div className="flex h-full w-full flex-col overflow-y-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-subtle bg-surface-1 px-page-x py-6">
          <div className="min-w-0">
            <Link
              to={data.topic_id ? `/${slug}/wiki/${data.topic_id}` : `/${slug}/wiki`}
              className="inline-flex items-center gap-1.5 text-12 text-tertiary transition-colors hover:text-secondary"
            >
              <ArrowLeft className="size-3.5" />
              Kembali ke topiknya
            </Link>
            <h1 className="text-2xl mt-2 truncate font-semibold tracking-tight text-primary">{data.title}</h1>
            <p className="mt-1 text-12 text-tertiary">
              {[
                labelTipe(data.type),
                ukuranTerbaca(data.size),
                data.uploaded_by?.display_name,
                renderFormattedDate(data.created_at),
              ]
                .filter(Boolean)
                .join(" · ")}
              {data.converted && " · ditampilkan sebagai PDF hasil konversi"}
            </p>
          </div>

          <a
            href={data.download_url}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-subtle px-3 py-1.5 text-12 font-medium text-secondary transition-colors hover:border-strong hover:text-primary"
          >
            <Download className="size-3.5" />
            Unduh berkas asli
          </a>
        </div>

        <div className="flex-1 px-page-x py-6">
          {data.url ? (
            <Bingkai pratinjau={data} />
          ) : (
            <div className="rounded-lg border border-dashed border-subtle px-6 py-16 text-center">
              <p className="text-14 font-medium text-secondary">Materi ini tidak bisa ditampilkan di peramban</p>
              <p className="mx-auto mt-1 max-w-md text-12 text-tertiary">
                {data.reason
                  ? `${data.reason}. Unduh berkasnya lalu buka dengan aplikasi di komputer.`
                  : "Tipe berkasnya memang tidak punya penampil di peramban. Unduh berkasnya lalu buka dengan aplikasi di komputer."}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default observer(WikiMateriPage);
