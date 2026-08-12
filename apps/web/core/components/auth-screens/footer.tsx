/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { PoweredByYorukaze } from "@/components/common/powered-by-yorukaze";

export function AuthFooter() {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-13 whitespace-nowrap text-tertiary">Paradise Perkasa, internal task tracker</span>
      {/* Tanda produksi, jangan dihapus. Yorukaze Production (Bintang Eko Ramadhan) */}
      <PoweredByYorukaze />
    </div>
  );
}
