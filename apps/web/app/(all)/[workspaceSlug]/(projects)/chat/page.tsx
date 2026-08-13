/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: Obrolan (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Link, useParams, useSearchParams } from "react-router";
import useSWR, { mutate } from "swr";
import { Eye, MessageSquare, Search, Send, SmilePlus } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { stringToEmoji } from "@plane/propel/emoji-icon-picker";
import { EmojiReactionPicker } from "@plane/propel/emoji-reaction";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar } from "@plane/ui";
import { getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
// services
import { ChatService, KUNCI_BELUM_DIBACA, type TPercakapan } from "@/services/chat.service";
// local imports
import { susunBaris } from "./baris";

const chatService = new ChatService();

// Selang tarik-ulang. Percakapan yang sedang dibuka diperiksa lebih sering
// daripada daftarnya, karena di situlah orang menunggu balasan.
// ponytail: angka tetap, bukan backoff. Naikkan kalau server terasa berat.
const SELANG_PESAN = 5000;
const SELANG_DAFTAR = 15000;
const TINGGI_TULIS_MAKS = 160;

type TBarisDaftar = { id: string; terakhir: TPercakapan | undefined };

/** Jam untuk pesan hari ini, tanggal untuk yang lebih lama.
 *
 * Bukan calculateTimeAgo: hasilnya berbahasa Inggris di UI berbahasa Indonesia,
 * dan "less than a minute ago" cukup panjang untuk mendesak nama orang sampai
 * terpotong jadi "Um...". */
const waktuRingkas = (waktu: string): string => {
  const tanggal = new Date(waktu);
  const hariIni = new Date().toDateString() === tanggal.toDateString();
  return (hariIni ? renderFormattedTime(waktu) : renderFormattedDate(waktu, "dd MMM")) ?? "";
};

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
  const [emojiTerbuka, setEmojiTerbuka] = useState(false);
  const akhirRef = useRef<HTMLDivElement>(null);
  const tulisRef = useRef<HTMLTextAreaElement>(null);

  const slug = workspaceSlug?.toString();

  const { data: percakapan, mutate: muatPercakapan } = useSWR(
    slug ? `CHAT_PERCAKAPAN_${slug}` : null,
    slug ? () => chatService.getPercakapan(slug) : null,
    { refreshInterval: SELANG_DAFTAR }
  );

  // Kunci yang sama dengan lencana di sidebar, jadi ini tidak menambah satu
  // permintaan pun: SWR mengembalikan nilai yang sudah ada di cache.
  const { data: status } = useSWR(slug ? KUNCI_BELUM_DIBACA : null, slug ? () => chatService.getStatus(slug) : null);

  const { data: pesan, mutate: muatPesan } = useSWR(
    slug && dengan ? `CHAT_PESAN_${slug}_${dengan}` : null,
    slug && dengan ? () => chatService.getPesan(slug, dengan) : null,
    { refreshInterval: SELANG_PESAN }
  );

  // Selalu tampilkan pesan terbaru saat percakapan bertambah atau berganti.
  useEffect(() => {
    akhirRef.current?.scrollIntoView({ block: "end" });
    // Memuat percakapan berarti menandainya terbaca di server, jadi lencana di
    // sidebar sudah basi sejak detik itu. Disegarkan di sini supaya angkanya
    // turun seketika, bukan pada tarikan 30 detik berikutnya.
    void mutate(KUNCI_BELUM_DIBACA);
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
    // Tidak ada pengurutan di sini sama sekali. Server sudah mengirim percakapan
    // terbaru lebih dulu, dan store sudah mengurutkan anggota menurut nama, jadi
    // menyambung dua daftar yang masing-masing sudah urut sudah cukup.
    const cocok = new Set(kandidat);
    const adaPesan = (percakapan ?? []).map((baris) => baris.lawan_bicara).filter((id) => cocok.has(id));
    const belumPernah = kandidat.filter((id) => !peta.has(id));
    return [...adaPesan, ...belumPernah].map((id) => ({ id, terakhir: peta.get(id) }));
  }, [percakapan, workspaceMemberIds, currentUser?.id, cari, getWorkspaceMemberDetails]);

  const barisPesan = useMemo(() => susunBaris(pesan ?? [], currentUser?.id), [pesan, currentUser?.id]);

  const lawanBicara = dengan ? getWorkspaceMemberDetails(dengan)?.member : undefined;

  const aturTinggiTulis = () => {
    const el = tulisRef.current;
    if (!el) return;
    // Tinggi dinolkan dulu; tanpa itu scrollHeight ikut tinggi lama dan kotaknya
    // tumbuh terus tapi tidak pernah menyusut lagi.
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TINGGI_TULIS_MAKS)}px`;
  };

  const kirim = async () => {
    const isi = draf.trim();
    if (!isi || !slug || !dengan || mengirim) return;
    setMengirim(true);
    try {
      await chatService.kirimPesan(slug, dengan, isi);
      setDraf("");
      if (tulisRef.current) tulisRef.current.style.height = "auto";
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
      <aside className="flex w-80 shrink-0 flex-col border-r border-subtle">
        <div className="border-b border-subtle p-3">
          <div className="focus-within:border-accent-primary flex items-center gap-2 rounded-md border border-subtle px-2.5 py-1.5">
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
              const adaBaru = (terakhir?.belum_dibaca ?? 0) > 0;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSearchParams({ dengan: id })}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-layer-1 ${
                    terpilih ? "bg-layer-1-selected" : ""
                  }`}
                >
                  <Avatar
                    name={anggota?.display_name}
                    src={getFileURL(anggota?.avatar_url ?? "")}
                    size={32}
                    shape="circle"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      {/* Belum dibaca ditandai tebal, bukan cuma lencana. Angka
                          saja mudah terlewat saat menyapu daftar dengan mata. */}
                      <p className={`text-sm truncate text-primary ${adaBaru ? "font-semibold" : "font-medium"}`}>
                        {anggota?.display_name ?? "Anggota"}
                      </p>
                      {terakhir ? (
                        <span className={`text-xs shrink-0 ${adaBaru ? "text-accent-primary" : "text-tertiary"}`}>
                          {waktuRingkas(terakhir.created_at)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className={`text-xs truncate ${adaBaru ? "font-medium text-secondary" : "text-tertiary"}`}>
                        {terakhir ? `${terakhir.dari_saya ? "Kamu: " : ""}${terakhir.isi}` : "Belum ada pesan"}
                      </p>
                      {adaBaru ? (
                        <span className="text-xs shrink-0 rounded-full bg-accent-primary px-1.5 font-medium text-white">
                          {terakhir?.belum_dibaca}
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
          <div className="flex h-full flex-col items-center justify-center gap-3 text-tertiary">
            <MessageSquare className="size-10" strokeWidth={1.25} />
            <div className="text-center">
              <p className="text-sm font-medium text-secondary">Belum ada percakapan yang dibuka</p>
              <p className="text-xs mt-1">Pilih orang di sebelah kiri untuk mulai mengobrol.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-subtle px-4 py-2.5">
              <Avatar
                name={lawanBicara?.display_name}
                src={getFileURL(lawanBicara?.avatar_url ?? "")}
                size={32}
                shape="circle"
              />
              <p className="text-sm font-medium text-primary">{lawanBicara?.display_name ?? "Anggota"}</p>
              {status?.pengawas ? (
                <Link
                  to={`/${slug}/chat/pengawasan`}
                  className="text-xs ml-auto flex items-center gap-1.5 rounded-md border border-subtle px-2.5 py-1.5 text-secondary hover:bg-layer-1"
                >
                  <Eye className="size-3.5" /> Pengawasan
                </Link>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {barisPesan.length === 0 ? (
                <p className="text-sm text-tertiary">Belum ada pesan. Mulai dari sini.</p>
              ) : (
                <div className="flex flex-col">
                  {barisPesan.map((baris) => {
                    if (baris.jenis === "tanggal")
                      return (
                        <div key={baris.kunci} className="my-3 flex items-center justify-center">
                          <span className="text-xs rounded-full bg-layer-3 px-2.5 py-1 font-medium text-secondary">
                            {baris.label}
                          </span>
                        </div>
                      );

                    if (baris.jenis === "belum-dibaca")
                      return (
                        <div key={baris.kunci} className="my-3 flex items-center gap-2">
                          <div className="h-px flex-1 bg-accent-primary/40" />
                          <span className="text-xs font-medium text-accent-primary">Pesan belum dibaca</span>
                          <div className="h-px flex-1 bg-accent-primary/40" />
                        </div>
                      );

                    const { pesan: p, dariSaya, awalKelompok, akhirKelompok } = baris;
                    return (
                      <div
                        key={baris.kunci}
                        className={`flex items-end gap-2 ${awalKelompok ? "mt-2" : "mt-0.5"} ${
                          dariSaya ? "justify-end" : "justify-start"
                        }`}
                      >
                        {/* Avatar hanya di pesan pertama tiap kelompok. Sisanya
                            diberi ruang kosong selebar avatar supaya gelembungnya
                            tetap sejajar. */}
                        {!dariSaya ? (
                          <div className="w-7 shrink-0">
                            {awalKelompok ? (
                              <Avatar
                                name={lawanBicara?.display_name}
                                src={getFileURL(lawanBicara?.avatar_url ?? "")}
                                size={28}
                                shape="circle"
                              />
                            ) : null}
                          </div>
                        ) : null}
                        <div
                          className={`max-w-[68%] px-3 py-2 ${
                            dariSaya
                              ? `bg-accent-primary text-white ${awalKelompok ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-tr-md rounded-br-md"}`
                              : `bg-layer-3 text-primary ${awalKelompok ? "rounded-2xl rounded-bl-md" : "rounded-2xl rounded-tl-md rounded-bl-md"}`
                          }`}
                        >
                          <p className="text-sm break-words whitespace-pre-wrap">{p.isi}</p>
                          {akhirKelompok ? (
                            <p className={`text-xs mt-1 ${dariSaya ? "text-white/70" : "text-tertiary"}`}>
                              {renderFormattedTime(p.created_at)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div ref={akhirRef} />
            </div>

            <div className="flex items-end gap-2 border-t border-subtle p-3">
              <EmojiReactionPicker
                isOpen={emojiTerbuka}
                handleToggle={setEmojiTerbuka}
                placement="top-start"
                onChange={(emoji) => {
                  // Picker memberi kode desimal, bukan karakternya. Tanpa
                  // stringToEmoji yang masuk ke pesan adalah angka.
                  setDraf((sebelumnya) => `${sebelumnya}${stringToEmoji(emoji)}`);
                  setEmojiTerbuka(false);
                  tulisRef.current?.focus();
                }}
                label={
                  <span
                    className="flex size-9 items-center justify-center rounded-md text-tertiary hover:bg-layer-1 hover:text-secondary"
                    aria-label="Sisipkan emoji"
                  >
                    <SmilePlus className="size-4" />
                  </span>
                }
              />
              <textarea
                ref={tulisRef}
                value={draf}
                onChange={(e) => {
                  setDraf(e.target.value);
                  aturTinggiTulis();
                }}
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
                className="text-sm focus:border-accent-primary min-h-9 flex-1 resize-none rounded-md border border-subtle bg-transparent px-3 py-2 text-primary outline-none placeholder:text-placeholder"
              />
              <button
                type="button"
                onClick={() => void kirim()}
                disabled={mengirim || draf.trim().length === 0}
                aria-label="Kirim pesan"
                className="flex size-9 items-center justify-center rounded-md bg-accent-primary text-white disabled:opacity-40"
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
