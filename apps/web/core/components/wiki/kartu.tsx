/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: kartu pustaka Wiki (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ArrowRight, BookOpen, FileText, Users } from "lucide-react";
import { Link } from "react-router";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TLogoProps } from "@plane/types";
// local imports
import { gradienUntuk } from "./gradien";

type TKartuDasar = {
  /** Tujuan klik. Sengaja `Link`, bukan onClick: klik tengah dan salin tautan tetap bekerja. */
  to: string;
  judul: string;
  keterangan?: string;
  logoProps?: TLogoProps;
};

type TKartuFolder = TKartuDasar & {
  jumlahAnak: number;
  satuanAnak: string;
  terbuka?: boolean;
};

type TKartuMateri = TKartuDasar & {
  cap?: string;
};

const SAMPUL = "relative flex h-[132px] items-center justify-center overflow-hidden";
const KARTU =
  "group flex flex-col overflow-hidden rounded-lg border border-subtle bg-layer-2 transition-shadow duration-200 hover:border-strong hover:shadow-raised-200 focus-visible:border-strong";

/** Ikon halaman kalau ada, kalau tidak ikon bawaan menurut jenis kartunya. */
function IkonSampul({ logoProps, fallback }: { logoProps?: TLogoProps; fallback: React.ReactNode }) {
  if (logoProps?.in_use) {
    return (
      <span className="grid size-16 place-items-center rounded-2xl bg-white/20 text-white backdrop-blur-[1px]">
        <Logo logo={logoProps} size={34} type="lucide" />
      </span>
    );
  }
  return <span className="text-white/95">{fallback}</span>;
}

/**
 * Kartu Divisi atau Topik: sesuatu yang BERISI hal lain.
 *
 * Bedanya dengan kartu Materi bukan sekadar hiasan. Kartu ini menjanjikan
 * "masih ada isinya di dalam", jadi ia selalu memakai kata kerja "Lihat" dan
 * selalu menyebut berapa banyak isinya, termasuk ketika isinya nol. Folder
 * kosong yang jujur mengaku kosong jauh lebih berguna daripada folder yang
 * terlihat sama saja lalu mengecewakan setelah diklik.
 */
export function KartuFolder({ to, judul, keterangan, logoProps, jumlahAnak, satuanAnak, terbuka }: TKartuFolder) {
  return (
    <Link to={to} className={KARTU}>
      <div className={SAMPUL} style={{ backgroundImage: gradienUntuk(judul) }}>
        <IkonSampul logoProps={logoProps} fallback={<BookOpen className="size-12" strokeWidth={1.5} />} />
        {terbuka && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-11 font-medium text-white backdrop-blur-[1px]">
            <Users className="size-3" /> Terbuka
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-15 truncate font-semibold text-primary">{judul}</h3>
        <p className="mt-1 line-clamp-1 text-12 text-tertiary">{keterangan || "Belum ada keterangan"}</p>

        <div className="mt-4 flex items-center justify-between border-t border-subtle pt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-subtle px-2.5 py-1 text-11 font-medium text-accent-primary">
            <BookOpen className="size-3.5" />
            {jumlahAnak} {satuanAnak}
          </span>
          <span className="inline-flex items-center gap-1 text-12 font-medium text-secondary transition-colors group-hover:text-accent-primary">
            Lihat <ArrowRight className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Kartu Materi: ujung pohon, satu dokumen untuk dibaca atau ditonton.
 *
 * Tombolnya bergaya garis, bukan teks polos seperti kartu folder, supaya
 * "membuka isi" dan "menelusuri lebih dalam" tidak terlihat sebagai aksi yang
 * sama. Itu satu-satunya perbedaan bentuk yang benar-benar membawa arti di
 * layar ini.
 */
export function KartuMateri({ to, judul, keterangan, logoProps, cap }: TKartuMateri) {
  return (
    <Link to={to} className={KARTU}>
      <div className={SAMPUL} style={{ backgroundImage: gradienUntuk(judul) }}>
        <IkonSampul logoProps={logoProps} fallback={<FileText className="size-12" strokeWidth={1.5} />} />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-15 truncate font-semibold text-primary">{judul}</h3>
        <p className="mt-1 line-clamp-1 text-12 text-tertiary">{keterangan}</p>

        <div className="mt-4 flex items-center justify-between border-t border-subtle pt-3">
          {cap ? (
            <span className="rounded-md bg-layer-3 px-2 py-1 text-11 font-medium tracking-wide text-tertiary">
              {cap}
            </span>
          ) : (
            <span />
          )}
          <span className="rounded-md border border-accent-strong px-3 py-1 text-12 font-medium text-accent-primary transition-colors group-hover:bg-accent-primary group-hover:text-on-color">
            Baca
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Kerangka kartu selagi pohonnya dimuat. Ukurannya sengaja sama persis supaya tidak ada lompatan tata letak. */
export function KartuKerangka() {
  return (
    <div className="overflow-hidden rounded-lg border border-subtle bg-layer-2">
      <div className="h-[132px] animate-pulse bg-layer-3" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-layer-3" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-layer-3" />
        <div className="mt-4 h-6 w-full animate-pulse rounded bg-layer-3" />
      </div>
    </div>
  );
}
