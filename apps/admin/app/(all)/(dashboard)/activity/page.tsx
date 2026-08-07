/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker — dashboard aktivitas (B.E.R)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import useSWR from "swr";
// plane imports
import { InstanceActivityService, type TLoginHistoryFilter, type TRetensi } from "@plane/services";
import { Loader } from "@plane/ui";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
// types
import type { Route } from "./+types/page";

const activityService = new InstanceActivityService();

const selectClass =
  "rounded-md border border-custom-border-200 bg-custom-background-100 px-2 py-1 text-sm text-custom-text-200";

const RENTANG = [
  { value: 7, label: "7 hari" },
  { value: 30, label: "30 hari" },
  { value: 90, label: "90 hari (maks)" },
];

const SKELETON = ["s1", "s2", "s3", "s4", "s5", "s6"];

function waktu(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Kartu({ label, nilai, catatan }: { label: string; nilai: number | string; catatan?: string }) {
  return (
    <div className="border-custom-border-200 bg-custom-background-100 rounded-lg border p-4">
      <div className="text-2xl text-custom-text-100 font-semibold">{nilai}</div>
      <div className="text-sm text-custom-text-200 mt-0.5">{label}</div>
      {catatan ? <div className="text-xs text-custom-text-400 mt-1">{catatan}</div> : null}
    </div>
  );
}

/** Peringatan retensi. Muncul jauh sebelum datanya hilang, bukan pada harinya. */
function PeringatanRetensi({ retensi }: { retensi: TRetensi }) {
  if (!retensi.perlu_peringatan) return null;
  return (
    <div className="border-amber-500/40 bg-amber-500/10 mx-4 flex items-start gap-3 rounded-lg border p-4">
      <AlertTriangle className="text-amber-500 mt-0.5 size-5 shrink-0" />
      <div className="text-sm">
        <div className="text-custom-text-100 font-medium">
          {retensi.akan_dibuang} peristiwa akan dihapus dalam {retensi.ambang_peringatan_hari} hari
        </div>
        <div className="text-custom-text-200 mt-1">
          Riwayat login disimpan {retensi.retensi_hari} hari. Data tertua {retensi.tertua ? waktu(retensi.tertua) : "—"}
          {retensi.sudah_lewat > 0 ? `, ${retensi.sudah_lewat} di antaranya sudah lewat batas` : ""}. Ekspor dulu kalau
          angkanya masih diperlukan — sesudah dihapus tidak bisa dikembalikan. Email peringatan juga dikirim ke semua
          Super Admin.
        </div>
      </div>
    </div>
  );
}

/** Grafik batang login harian. Sengaja CSS murni — tidak menambah dependensi. */
function GrafikHarian({ harian }: { harian: Record<string, { orang: number; login: number }> }) {
  const baris = Object.entries(harian);
  if (baris.length === 0) {
    return (
      <div className="border-custom-border-200 text-sm text-custom-text-300 rounded-lg border p-6 text-center">
        Belum ada login yang tercatat pada rentang ini.
        <div className="text-xs text-custom-text-400 mt-1">
          Riwayat baru mulai direkam sejak fitur ini dipasang — hari-hari sebelumnya memang kosong, bukan sepi.
        </div>
      </div>
    );
  }
  const maks = Math.max(...baris.map(([, v]) => v.login), 1);
  return (
    <div className="border-custom-border-200 rounded-lg border p-4">
      <div className="flex h-40 items-end gap-1 overflow-x-auto">
        {baris.map(([tgl, v]) => (
          <div
            key={tgl}
            className="flex min-w-[10px] flex-1 flex-col items-center gap-1"
            title={`${tgl}: ${v.login} login, ${v.orang} orang`}
          >
            <div
              className="bg-custom-primary-100/70 w-full rounded-t"
              style={{ height: `${Math.max(4, (v.login / maks) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="text-xs text-custom-text-400 mt-2 flex justify-between">
        <span>{baris[0]?.[0]}</span>
        <span>{baris[baris.length - 1]?.[0]}</span>
      </div>
    </div>
  );
}

const ActivityPage = function ActivityPage(_props: Route.ComponentProps) {
  const [hari, setHari] = useState(30);
  const [filter, setFilter] = useState<TLoginHistoryFilter>({ page: 1, per_page: 25, hari: 30 });

  const { data, isLoading, error } = useSWR(["INSTANCE_ACTIVITY", hari], () => activityService.summary(hari), {
    revalidateOnFocus: false,
    // Siapa yang sedang memakai berubah tiap menit — data yang beku di layar
    // lebih menyesatkan daripada tidak ada angkanya sama sekali.
    refreshInterval: 60_000,
  });

  const { data: riwayat, isLoading: memuatRiwayat } = useSWR(
    ["INSTANCE_LOGIN_HISTORY", filter],
    () => activityService.history(filter),
    { revalidateOnFocus: false }
  );

  const ubahRentang = useMemo(
    () => (n: number) => {
      setHari(n);
      // Rentang riwayat ikut, kalau tidak tabel di bawah bercerita tentang
      // periode yang berbeda dari kartu di atasnya.
      setFilter((f) => ({ ...f, hari: n, page: 1 }));
    },
    []
  );

  const r = data?.ringkas;
  const halaman = riwayat?.page ?? 1;
  const totalHalaman = riwayat?.total_pages ?? 1;

  return (
    <PageWrapper
      size="lg"
      header={{
        title: "Aktivitas",
        description:
          "Siapa sedang memakai, siapa masih login, dan seberapa sering orang keluar-masuk. Riwayat disimpan 3 bulan.",
      }}
    >
      {error ? (
        <div className="border-red-500/40 bg-red-500/10 text-sm text-custom-text-200 mx-4 rounded-md border p-4">
          Gagal memuat aktivitas. Coba muat ulang halaman.
        </div>
      ) : null}

      {data?.retensi ? <PeringatanRetensi retensi={data.retensi} /> : null}

      <div className="mx-4 flex items-center gap-2">
        <span className="text-sm text-custom-text-300">Rentang</span>
        <select value={hari} onChange={(e) => ubahRentang(Number(e.target.value))} className={selectClass}>
          {RENTANG.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mx-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading || !r ? (
          <Loader className="col-span-full">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {SKELETON.slice(0, 4).map((k) => (
                <Loader.Item key={k} height="88px" />
              ))}
            </div>
          </Loader>
        ) : (
          <Fragment>
            <Kartu
              label="Sedang memakai"
              nilai={r.sedang_memakai}
              catatan={`ada request dalam ${data.ambang_aktif_menit} menit terakhir`}
            />
            <Kartu label="Masih login" nilai={r.masih_login} catatan="sesi hidup, belum tentu di depan layar" />
            <Kartu label="Belum pernah login" nilai={r.belum_pernah_login} catatan={`dari ${r.total_user} akun`} />
            <Kartu
              label="Login pada rentang ini"
              nilai={r.total_login}
              catatan={`${r.user_yang_login} orang, rata-rata ${r.rata_login_per_user}×`}
            />
          </Fragment>
        )}
      </div>

      <div className="mx-4">
        <h3 className="text-sm text-custom-text-200 mb-2 font-medium">Login per hari</h3>
        {isLoading || !data ? <Loader.Item height="176px" /> : <GrafikHarian harian={data.harian} />}
      </div>

      <div className="mx-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm text-custom-text-200 font-medium">Riwayat keluar-masuk</h3>
          <select
            value={filter.jenis ?? ""}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                jenis: (e.target.value || undefined) as TLoginHistoryFilter["jenis"],
                page: 1,
              }))
            }
            className={selectClass}
          >
            <option value="">Semua</option>
            <option value="LOGIN">Login saja</option>
            <option value="LOGOUT">Logout saja</option>
          </select>
        </div>

        <div className="border-custom-border-200 overflow-x-auto rounded-lg border">
          <table className="text-sm w-full">
            <thead className="bg-custom-background-90 text-xs text-custom-text-300 text-left uppercase">
              <tr>
                <th className="px-3 py-2">Waktu</th>
                <th className="px-3 py-2">Orang</th>
                <th className="px-3 py-2">Peristiwa</th>
                <th className="px-3 py-2">Dari</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {memuatRiwayat ? (
                SKELETON.map((k) => (
                  <tr key={k}>
                    <td colSpan={5} className="px-3 py-2">
                      <Loader.Item height="20px" />
                    </td>
                  </tr>
                ))
              ) : (riwayat?.results.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="text-custom-text-300 px-3 py-6 text-center">
                    Belum ada peristiwa pada rentang ini.
                  </td>
                </tr>
              ) : (
                riwayat?.results.map((e) => (
                  <tr key={e.id} className="border-custom-border-200 border-t">
                    <td className="text-custom-text-200 px-3 py-2 whitespace-nowrap">{waktu(e.terjadi_pada)}</td>
                    <td className="px-3 py-2">
                      <div className="text-custom-text-100">{e.display_name || "—"}</div>
                      <div className="text-xs text-custom-text-400">{e.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs rounded px-1.5 py-0.5 ${
                          e.jenis === "LOGIN"
                            ? "bg-green-500/15 text-green-600"
                            : "bg-custom-background-80 text-custom-text-300"
                        }`}
                      >
                        {e.jenis === "LOGIN" ? "Masuk" : "Keluar"}
                      </span>
                    </td>
                    <td className="text-custom-text-300 px-3 py-2">{e.permukaan || "—"}</td>
                    <td className="text-custom-text-300 px-3 py-2">{e.ip || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="text-sm text-custom-text-300 mt-2 flex items-center justify-between">
          <span>
            {riwayat?.count ?? 0} peristiwa · halaman {halaman} dari {totalHalaman}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={halaman <= 1}
              onClick={() => setFilter((f) => ({ ...f, page: halaman - 1 }))}
              className="border-custom-border-200 rounded border p-1 disabled:opacity-40"
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              disabled={halaman >= totalHalaman}
              onClick={() => setFilter((f) => ({ ...f, page: halaman + 1 }))}
              className="border-custom-border-200 rounded border p-1 disabled:opacity-40"
              aria-label="Halaman berikutnya"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default ActivityPage;
