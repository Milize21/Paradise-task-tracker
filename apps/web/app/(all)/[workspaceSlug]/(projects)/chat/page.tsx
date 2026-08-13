/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: Obrolan (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "react-router";
import useSWR from "swr";
import { MessageSquare, Search, Send } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar } from "@plane/ui";
import { calculateTimeAgo, getFileURL, renderFormattedTime } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
// services
import { ChatService, type TPercakapan } from "@/services/chat.service";

const chatService = new ChatService();

// Selang tarik-ulang. Percakapan yang sedang dibuka diperiksa lebih sering
// daripada daftarnya, karena di situlah orang menunggu balasan. Lencana "belum
// dibaca" ikut selang daftar, jadi bisa tertinggal beberapa detik setelah
// percakapan dibuka. Itu diterima, bukan terlewat.
// ponytail: angka tetap, bukan backoff. Naikkan kalau server terasa berat.
const SELANG_PESAN = 5000;
const SELANG_DAFTAR = 15000;

type TBarisDaftar = { id: string; terakhir: TPercakapan | undefined };

function ChatPage() {
  const { workspaceSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const dengan = searchParams.get("dengan");
  // store hooks
  const { data: currentUser } = useUser();
  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const { t } = useTranslation();
  // states
  const [cari, setCari] = useState("");
  const [draf, setDraf] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const akhirRef = useRef<HTMLDivElement>(null);

  const slug = workspaceSlug?.toString();

  const { data: percakapan, mutate: muatPercakapan } = useSWR(
    slug ? `CHAT_PERCAKAPAN_${slug}` : null,
    slug ? () => chatService.getPercakapan(slug) : null,
    { refreshInterval: SELANG_DAFTAR }
  );

  const { data: pesan, mutate: muatPesan } = useSWR(
    slug && dengan ? `CHAT_PESAN_${slug}_${dengan}` : null,
    slug && dengan ? () => chatService.getPesan(slug, dengan) : null,
    { refreshInterval: SELANG_PESAN }
  );

  // Selalu tampilkan pesan terbaru saat percakapan bertambah atau berganti.
  useEffect(() => {
    akhirRef.current?.scrollIntoView({ block: "end" });
  }, [pesan?.length, dengan]);

  const daftar: TBarisDaftar[] = useMemo(() => {
    const peta = new Map((percakapan ?? []).map((baris) => [baris.lawan_bicara, baris]));
    const kunciCari = cari.trim().toLowerCase();
    const kandidat = (workspaceMemberIds ?? []).filter((id) => {
      if (id === currentUser?.id) return false;
      if (!kunciCari) return true;
      const nama = getWorkspaceMemberDetails(id)?.member?.display_name ?? "";
      return nama.toLowerCase().includes(kunciCari);
    });
    // Yang sudah pernah mengobrol naik ke atas menurut waktu; sisanya tetap
    // menurut nama, karena store sudah mengurutkannya begitu.
    return kandidat
      .toSorted((a, b) => {
        const pa = peta.get(a);
        const pb = peta.get(b);
        if (pa && pb) return pa.created_at < pb.created_at ? 1 : -1;
        if (pa) return -1;
        if (pb) return 1;
        return 0;
      })
      .map((id) => ({ id, terakhir: peta.get(id) }));
  }, [percakapan, workspaceMemberIds, currentUser?.id, cari, getWorkspaceMemberDetails]);

  const lawanBicara = dengan ? getWorkspaceMemberDetails(dengan)?.member : undefined;

  const kirim = async () => {
    const isi = draf.trim();
    if (!isi || !slug || !dengan || mengirim) return;
    setMengirim(true);
    try {
      await chatService.kirimPesan(slug, dengan, isi);
      setDraf("");
      await Promise.all([muatPesan(), muatPercakapan()]);
    } catch (galat) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Pesan gagal terkirim",
        message: (galat as { error?: string })?.error ?? "Coba lagi sebentar.",
      });
    } finally {
      setMengirim(false);
    }
  };

  if (!slug) return <></>;

  return (
    <div className="flex h-full w-full">
      <PageHead title={t("chat_nav")} />

      {/* Daftar orang */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-subtle">
        <div className="border-b border-subtle p-3">
          <div className="flex items-center gap-2 rounded-md border border-subtle px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-tertiary" />
            <input
              type="text"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari orang"
              aria-label="Cari orang"
              className="text-sm w-full bg-transparent text-primary outline-none placeholder:text-placeholder"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {daftar.length === 0 ? (
            <p className="text-sm p-3 text-tertiary">Tidak ada orang yang cocok.</p>
          ) : (
            daftar.map(({ id, terakhir }) => {
              const anggota = getWorkspaceMemberDetails(id)?.member;
              const terpilih = id === dengan;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSearchParams({ dengan: id })}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-layer-2 ${
                    terpilih ? "bg-layer-2" : ""
                  }`}
                >
                  <Avatar
                    name={anggota?.display_name}
                    src={getFileURL(anggota?.avatar_url ?? "")}
                    size={28}
                    shape="circle"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm truncate font-medium text-primary">{anggota?.display_name ?? "Anggota"}</p>
                      {terakhir ? (
                        <span className="text-xs shrink-0 text-tertiary">{calculateTimeAgo(terakhir.created_at)}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs truncate text-tertiary">
                        {terakhir ? `${terakhir.dari_saya ? "Kamu: " : ""}${terakhir.isi}` : "Belum ada pesan"}
                      </p>
                      {terakhir && terakhir.belum_dibaca > 0 ? (
                        <span className="text-xs shrink-0 rounded-full bg-accent-primary px-1.5 font-medium text-white">
                          {terakhir.belum_dibaca}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Percakapan */}
      <section className="flex min-w-0 flex-1 flex-col">
        {!dengan ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-tertiary">
            <MessageSquare className="size-8" />
            <p className="text-sm">Pilih orang di sebelah kiri untuk mulai mengobrol.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-subtle px-4 py-2.5">
              <Avatar
                name={lawanBicara?.display_name}
                src={getFileURL(lawanBicara?.avatar_url ?? "")}
                size={28}
                shape="circle"
              />
              <p className="text-sm font-medium text-primary">{lawanBicara?.display_name ?? "Anggota"}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {(pesan ?? []).length === 0 ? (
                <p className="text-sm text-tertiary">Belum ada pesan. Mulai dari sini.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {(pesan ?? []).map((baris) => {
                    const dariSaya = baris.pengirim === currentUser?.id;
                    return (
                      <div key={baris.id} className={`flex ${dariSaya ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[70%] rounded-lg px-3 py-2 ${
                            dariSaya ? "bg-accent-primary text-white" : "bg-layer-2 text-primary"
                          }`}
                        >
                          <p className="text-sm break-words whitespace-pre-wrap">{baris.isi}</p>
                          <p className={`text-xs mt-1 ${dariSaya ? "text-white/70" : "text-tertiary"}`}>
                            {renderFormattedTime(baris.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div ref={akhirRef} />
            </div>

            <div className="flex items-end gap-2 border-t border-subtle p-3">
              <textarea
                value={draf}
                onChange={(e) => setDraf(e.target.value)}
                onKeyDown={(e) => {
                  // Enter mengirim, Shift+Enter ganti baris. Kebiasaan yang
                  // sudah dibawa orang dari aplikasi obrolan lain.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void kirim();
                  }
                }}
                rows={1}
                placeholder="Tulis pesan"
                aria-label="Tulis pesan"
                className="text-sm max-h-32 min-h-9 flex-1 resize-y rounded-md border border-subtle bg-transparent px-3 py-2 text-primary outline-none placeholder:text-placeholder"
              />
              <button
                type="button"
                onClick={() => void kirim()}
                disabled={mengirim || draf.trim().length === 0}
                aria-label="Kirim pesan"
                className="flex h-9 items-center gap-1.5 rounded-md bg-accent-primary px-3 text-white disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default observer(ChatPage);
