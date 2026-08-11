/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker — tanda produksi Yorukaze (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// assets
import logoDark from "@/app/assets/yorukaze-dark.png?url";
import logoLight from "@/app/assets/yorukaze-light.png?url";

type TPoweredByYorukaze = {
  /** Kelas tambahan untuk pembungkus — dipakai penempatan, bukan gaya. */
  className?: string;
};

/**
 * Tanda "Powered by Yorukaze Production" untuk God Mode.
 *
 * Logo terang/gelap dipilih lewat CSS (`dark:`), bukan `useTheme()` — bercabang
 * di JS atas `resolvedTheme` melahirkan mismatch hidrasi (BUG-05).
 *
 * ponytail: kembaran dari apps/web & apps/space. Lihat catatan di berkas web.
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
