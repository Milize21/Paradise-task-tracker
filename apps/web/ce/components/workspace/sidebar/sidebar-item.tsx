/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IWorkspaceSidebarNavigationItem } from "@plane/constants";
import { SidebarItemBase } from "@/components/workspace/sidebar/sidebar-item";

type Props = {
  item: IWorkspaceSidebarNavigationItem;
};

// SidebarItemBase menyembunyikan item nav dinamis yang tidak ter-pin
// (`if (!isPinned && !staticItems.includes(item.key)) return null`), dan default
// preferensi adalah TIDAK ter-pin. Akibatnya fitur kustom kita tidak pernah
// muncul di sidebar siapa pun kecuali tiap user mem-pin-nya sendiri lewat
// "Customize navigation", yang tidak akan dilakukan orang yang belum tahu
// fiturnya ada. Didaftarkan di sini supaya selalu tampil, memakai titik
// ekstensi yang memang sudah disediakan upstream.
const PARADISE_ALWAYS_VISIBLE_ITEMS = ["wiki", "dashboard_divisi", "initiatives"];

export function SidebarItem({ item }: Props) {
  return <SidebarItemBase item={item} additionalStaticItems={PARADISE_ALWAYS_VISIBLE_ITEMS} />;
}
