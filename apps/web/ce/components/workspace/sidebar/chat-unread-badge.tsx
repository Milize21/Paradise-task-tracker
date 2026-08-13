/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: lencana pesan belum dibaca (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// components
import { CountChip } from "@/components/common/count-chip";
// services
import { useSuaraNotifikasi } from "@/hooks/use-suara-notifikasi";
import { ChatService, KUNCI_BELUM_DIBACA } from "@/services/chat.service";

const chatService = new ChatService();

// Lencana ini hidup di sidebar, jadi ikut ditarik dari SETIAP halaman. 30 detik,
// bukan 5 seperti percakapan yang sedang dibuka: yang ini cuma perlu memberi
// tahu bahwa ada sesuatu, bukan menyampaikan isinya. Saat percakapan dibuka,
// halaman Obrolan memanggil mutate pada kunci yang sama sehingga angkanya turun
// seketika, tanpa menunggu putaran berikutnya.
const SELANG = 30000;

type Props = { workspaceSlug: string };

export const ChatUnreadBadge = observer(function ChatUnreadBadge({ workspaceSlug }: Props) {
  const { data: status } = useSWR(
    workspaceSlug ? KUNCI_BELUM_DIBACA : null,
    workspaceSlug ? () => chatService.getStatus(workspaceSlug) : null,
    { refreshInterval: SELANG }
  );

  const jumlah = status?.jumlah ?? 0;
  const { bunyikan } = useSuaraNotifikasi();
  const sebelumnya = useRef<number | null>(null);

  useEffect(() => {
    if (!status) return;
    // Muatan PERTAMA tidak pernah berbunyi. Tanpa penjaga ini, membuka
    // aplikasi dengan pesan lama yang belum dibaca langsung disambut bunyi,
    // padahal tidak ada yang baru saja terjadi.
    if (sebelumnya.current !== null && status.jumlah > sebelumnya.current) bunyikan("pesan");
    sebelumnya.current = status.jumlah;
  }, [status, bunyikan]);

  if (jumlah <= 0) return <></>;

  return (
    <div className="ml-auto">
      <CountChip count={jumlah > 99 ? "99+" : `${jumlah}`} />
    </div>
  );
});
