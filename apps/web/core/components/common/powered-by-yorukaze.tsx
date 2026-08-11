/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker — tanda produksi Yorukaze (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// assets
import logoDark from "@/app/assets/logos/yorukaze-dark.png?url";
import logoLight from "@/app/assets/logos/yorukaze-light.png?url";

type TPoweredByYorukaze = {
  /** Kelas tambahan untuk pembungkus — dipakai penempatan, bukan gaya. */
  className?: string;
};

/**
 * Tanda "Powered by Yorukaze Production".
 *
 * Pemilihan logo terang/gelap SENGAJA lewat CSS (`dark:`), bukan `useTheme()`.
 * `resolvedTheme` dari next-themes terisi sinkron di klien tapi kosong di HTML
 * prerender, jadi bercabang di JS akan melahirkan mismatch hidrasi — persis
 * BUG-05 yang sudah pernah menghantui root.tsx. CSS tidak punya masalah itu:
 * kedua gambar dirender, satu disembunyikan oleh atribut `data-theme`.
 *
 * ponytail: komponen ini digandakan kecil-kecilan di apps/space & apps/admin.
 * Yang berbeda cuma jalur impor aset, dan menyatukannya berarti menyalurkan
 * resolusi URL aset lewat tiga build vite — lebih banyak mesin daripada 12
 * baris yang dihematnya. Satukan kalau nanti sudah ada paket aset bersama.
 */
export function PoweredByYorukaze(props: TPoweredByYorukaze) {
  const { className = "" } = props;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="text-11 whitespace-nowrap text-tertiary/70">Powered by</span>
      <img src={logoLight} alt="Yorukaze Production" className="h-3.5 w-auto opacity-70 dark:hidden" />
      <img src={logoDark} alt="Yorukaze Production" className="hidden h-3.5 w-auto opacity-70 dark:block" />
    </div>
  );
}
