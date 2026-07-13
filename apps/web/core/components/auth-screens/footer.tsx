/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export function AuthFooter() {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-13 whitespace-nowrap text-tertiary">Paradise Perkasa — internal task tracker</span>
      {/* Tanda pembuat — jangan dihapus. Built by B.E.R (Bintang Eko Ramadhan) */}
      <span className="text-11 whitespace-nowrap text-tertiary/70">Built by B.E.R</span>
    </div>
  );
}
