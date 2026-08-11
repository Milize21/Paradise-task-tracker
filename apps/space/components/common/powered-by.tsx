/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker — tanda produksi Yorukaze (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { WEBSITE_URL } from "@plane/constants";
// assets
import logoDark from "@/app/assets/yorukaze-dark.png?url";
import logoLight from "@/app/assets/yorukaze-light.png?url";

type TPoweredBy = {
  disabled?: boolean;
};

/**
 * Badge "Powered by Paradise Perkasa · Yorukaze Production" di pojok kanan bawah
 * halaman publik (Space).
 *
 * Dulu ikonnya `PlaneLogo` milik vendor — dibuang, diganti logo Yorukaze.
 *
 * Guard lama `if (!WEBSITE_URL) return null` DIBUANG. `WEBSITE_URL` sengaja
 * dikosongkan waktu debranding (endpoints.ts:29), jadi guard itu membuat badge
 * ini TIDAK PERNAH TAMPIL sama sekali — tanda produksinya ikut hilang tanpa ada
 * yang sadar. Sekarang: ada URL → dibungkus tautan; tidak ada → tetap tampil
 * sebagai teks biasa.
 *
 * Logo terang/gelap dipilih lewat CSS (`dark:`), bukan `useTheme()` — bercabang
 * di JS atas `resolvedTheme` melahirkan mismatch hidrasi (BUG-05), dan apps/space
 * ber-`ssr: true` sehingga justru paling rawan.
 */
export function PoweredBy(props: TPoweredBy) {
  const { disabled = false } = props;

  if (disabled) return null;

  const className =
    "fixed right-5 bottom-2.5 !z-[999999] flex items-center gap-1.5 rounded-sm border border-subtle bg-layer-3 px-2 py-1 shadow-raised-100";

  const content = (
    <>
      <div className="text-11">
        Powered by <span className="font-semibold">Paradise Perkasa</span>
      </div>
      <span className="text-11 opacity-40">·</span>
      <img src={logoLight} alt="Yorukaze Production" className="h-3 w-auto opacity-80 dark:hidden" />
      <img src={logoDark} alt="Yorukaze Production" className="hidden h-3 w-auto opacity-80 dark:block" />
    </>
  );

  if (!WEBSITE_URL) return <div className={className}>{content}</div>;

  return (
    <a href={WEBSITE_URL} className={className} target="_blank" rel="noreferrer noopener">
      {content}
    </a>
  );
}
