/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: pengawasan obrolan (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams, Link } from "react-router";
import useSWR from "swr";
import { Eye, Search, ShieldAlert } from "lucide-react";
// plane imports
import { Avatar } from "@plane/ui";
import { getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// hooks
import { useMember } from "@/hooks/store/use-member";
// services
import { ChatService, KUNCI_BELUM_DIBACA } from "@/services/chat.service";
// local imports
import { susunBaris } from "../baris";

const chatService = new ChatService();

function PengawasanPage() {
  const { workspaceSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    workspace: { getWorkspaceMemberDetails },
  } = useMember();
  const [cari, setCari] = useState("");

  const slug = workspaceSlug?.toString();
  const a = searchParams.get("a");
  const b = searchParams.get("b");

  // Kunci yang sama dengan lencana sidebar, jadi tidak ada permintaan tambahan
  // hanya untuk mengetahui status pengawas.
  const { data: status } = useSWR(slug ? KUNCI_BELUM_DIBACA : null, slug ? () => chatService.getStatus(slug) : null);

  const { data: pasangan, error } = useSWR(
    slug && status?.pengawas ? `CHAT_PENGAWASAN_${slug}` : null,
    slug && status?.pengawas ? () => chatService.getPengawasan(slug) : null
  );

  const { data: pesan } = useSWR(
    slug && a && b ? `CHAT_PENGAWASAN_${slug}_${a}_${b}` : null,
    slug && a && b ? () => chatService.getPengawasanPesan(slug, a, b) : null
  );

  const nama = (id: string) => getWorkspaceMemberDetails(id)?.member?.display_name ?? "Anggota";

  const daftar = useMemo(() => {
    const kunci = cari.trim().toLowerCase();
    if (!kunci) return pasangan ?? [];
    return (pasangan ?? []).filter((baris) => baris.orang.some((id) => nama(id).toLowerCase().includes(kunci)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasangan, cari, getWorkspaceMemberDetails]);

  // Di layar ini tidak ada "pesan saya": semua pesan milik orang lain, jadi
  // sayaId dikosongkan dan semuanya dirender rata kiri.
  const barisPesan = useMemo(() => susunBaris(pesan ?? [], undefined), [pesan]);

  if (!slug) return <></>;

  if (status && !status.pengawas)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-tertiary">
        <ShieldAlert className="size-10" strokeWidth={1.25} />
        <p className="text-sm">Halaman ini hanya untuk pemilik workspace.</p>
        <Link to={`/${slug}/chat`} className="text-sm text-accent-primary">
          Kembali ke Obrolan
        </Link>
      </div>
    );

  return (
    <div className="flex h-full w-full">
      <PageHead title="Pengawasan Obrolan" />

      <aside className="flex w-96 shrink-0 flex-col border-r border-subtle">
        <div className="border-b border-subtle p-3">
          <div className="flex items-center gap-2 rounded-md border border-subtle px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-tertiary" />
            <input
              type="text"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari nama"
              aria-label="Cari nama"
              className="text-sm w-full bg-transparent text-primary outline-none placeholder:text-placeholder"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <p className="text-sm p-3 text-tertiary">Gagal memuat. Coba muat ulang halaman.</p>
          ) : daftar.length === 0 ? (
            <p className="text-sm p-3 text-tertiary">Belum ada percakapan.</p>
          ) : (
            daftar.map((baris) => {
              const [x, y] = baris.orang;
              const terpilih = (a === x && b === y) || (a === y && b === x);
              return (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  onClick={() => setSearchParams({ a: x, b: y })}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-layer-1 ${
                    terpilih ? "bg-layer-1-selected" : ""
                  }`}
                >
                  <div className="flex shrink-0 -space-x-2">
                    <Avatar
                      name={nama(x)}
                      src={getFileURL(getWorkspaceMemberDetails(x)?.member?.avatar_url ?? "")}
                      size={28}
                      shape="circle"
                    />
                    <Avatar
                      name={nama(y)}
                      src={getFileURL(getWorkspaceMemberDetails(y)?.member?.avatar_url ?? "")}
                      size={28}
                      shape="circle"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate font-medium text-primary">
                      {nama(x)} &harr; {nama(y)}
                    </p>
                    <p className="text-xs text-tertiary">
                      {baris.jumlah} pesan &middot; terakhir {renderFormattedDate(baris.terakhir, "dd MMM")}{" "}
                      {renderFormattedTime(baris.terakhir)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!a || !b ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-tertiary">
            <Eye className="size-10" strokeWidth={1.25} />
            <p className="text-sm">Pilih percakapan di sebelah kiri.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-subtle px-4 py-2.5">
              <p className="text-sm font-medium text-primary">
                {nama(a)} &harr; {nama(b)}
              </p>
              {/* Ditulis terang-terangan, bukan disamarkan. Layar ini membaca
                  pesan pribadi orang lain, dan siapa pun yang membukanya
                  sebaiknya tahu persis apa yang sedang ia lakukan. */}
              <span className="text-xs text-tertiary">Mode pengawasan, hanya baca</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {barisPesan.length === 0 ? (
                <p className="text-sm text-tertiary">Belum ada pesan.</p>
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
                    if (baris.jenis === "belum-dibaca") return null;

                    const { pesan: p, awalKelompok, akhirKelompok } = baris;
                    return (
                      <div key={baris.kunci} className={`flex items-end gap-2 ${awalKelompok ? "mt-2" : "mt-0.5"}`}>
                        <div className="w-7 shrink-0">
                          {awalKelompok ? (
                            <Avatar
                              name={nama(p.pengirim)}
                              src={getFileURL(getWorkspaceMemberDetails(p.pengirim)?.member?.avatar_url ?? "")}
                              size={28}
                              shape="circle"
                            />
                          ) : null}
                        </div>
                        <div className="max-w-[68%] rounded-2xl rounded-bl-md bg-layer-3 px-3 py-2 text-primary">
                          {awalKelompok ? (
                            <p className="text-xs mb-0.5 font-medium text-secondary">{nama(p.pengirim)}</p>
                          ) : null}
                          <p className="text-sm break-words whitespace-pre-wrap">{p.isi}</p>
                          {akhirKelompok ? (
                            <p className="text-xs mt-1 text-tertiary">{renderFormattedTime(p.created_at)}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default observer(PengawasanPage);
