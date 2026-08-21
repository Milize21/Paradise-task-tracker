/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: penjaga pemberitahuan (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useNavigate } from "react-router";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import useLocalStorage from "@/hooks/use-local-storage";
import { useSuaraNotifikasi } from "@/hooks/use-suara-notifikasi";
// services
import { ChatService, KUNCI_BELUM_DIBACA } from "@/services/chat.service";
import { WorkspaceNotificationService } from "@/services/workspace-notification.service";
// local imports
import { ringkasNotifikasi, ringkasPercakapan, type TRingkasan } from "./teks";

const chatService = new ChatService();
const notifService = new WorkspaceNotificationService();

/** Sama dengan lencana di sidebar, dan itu disengaja: keduanya memakai kunci
 * SWR yang sama, jadi satu putaran ini melayani lencana sekaligus penjaga. */
const SELANG = 30000;

const KUNCI_JUMLAH_NOTIF = "WORKSPACE_UNREAD_NOTIFICATION_COUNT";
/** Penolakan spanduk izin disimpan, karena menawarkan hal yang sama tiap kali
 * halaman dibuka adalah cara membuat orang membenci fiturnya. */
const KUNCI_SPANDUK = "spanduk_izin_notifikasi_ditutup";

type TKeluaran = TRingkasan & { tautan: string };

/**
 * Memberi tahu satu kali, lewat jalur yang paling mungkin sampai.
 *
 * Tab yang sedang dilihat mendapat toast di dalam aplikasi; tab yang tersembunyi
 * mendapat pemberitahuan sistem operasi. Sengaja BUKAN keduanya sekaligus:
 * memunculkan kartu Windows untuk pesan yang barusan muncul sendiri di layar
 * adalah gangguan, dan gangguan adalah alasan orang mematikan pemberitahuan.
 *
 * Bunyi tetap dibunyikan di kedua keadaan, karena orang bisa sedang melihat
 * layar lain dengan tab ini masih "visible" di monitor kedua.
 */
const useTampilkan = () => {
  const { bunyikan } = useSuaraNotifikasi();
  const navigate = useNavigate();

  return useCallback(
    (keluaran: TKeluaran, penanda: string) => {
      bunyikan("pesan");

      const tersembunyi = typeof document !== "undefined" && document.visibilityState !== "visible";
      const bisaSistem =
        typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";

      if (tersembunyi && bisaSistem) {
        // `tag` membuat pemberitahuan berikutnya MENGGANTI yang sebelumnya,
        // bukan menumpuk. Meninggalkan tab semalam lalu menemukan 40 kartu di
        // Pusat Tindakan bukan pemberitahuan, itu hukuman.
        const kartu = new Notification(keluaran.judul, {
          body: keluaran.isi,
          icon: "/favicon/android-chrome-192x192.png",
          tag: penanda,
        });
        kartu.addEventListener("click", () => {
          window.focus();
          navigate(keluaran.tautan);
          kartu.close();
        });
        return;
      }

      setToast({
        type: TOAST_TYPE.INFO,
        title: keluaran.judul,
        message: keluaran.isi,
        actionItems: (
          <Button variant="link" size="sm" onClick={() => navigate(keluaran.tautan)}>
            Buka
          </Button>
        ),
      });
    },
    [bunyikan, navigate]
  );
};

/**
 * Mengintai dua hitungan murah, lalu mengambil isinya hanya saat naik.
 *
 * Kenapa mengintai dan bukan WebSocket: sambungan langsung yang sudah ada hanya
 * hidup di halaman Obrolan dan hanya untuk satu ruang, sementara pemberitahuan
 * pekerjaan lahir di Celery dan tidak pernah lewat sana sama sekali. Membuat
 * satu saluran langsung untuk seluruh aplikasi adalah pekerjaan yang jauh lebih
 * besar daripada yang diminta, dan hitungan yang sudah ditarik lencana tiap 30
 * detik ini gratis: kuncinya sama, jadi SWR menggabungkannya jadi satu
 * permintaan.
 *
 * Yang mahal (isi percakapan, daftar pemberitahuan) baru diambil saat angkanya
 * NAIK. Dalam keadaan tenang, penjaga ini tidak menambah satu pun permintaan.
 */
export function PenjagaNotifikasi({ workspaceSlug }: { workspaceSlug: string }) {
  const tampilkan = useTampilkan();
  const { getUnreadNotificationsCount } = useWorkspaceNotifications();
  const {
    workspace: { getWorkspaceMemberDetails },
  } = useMember();

  const { data: statusObrolan } = useSWR(
    workspaceSlug ? KUNCI_BELUM_DIBACA : null,
    workspaceSlug ? () => chatService.getStatus(workspaceSlug) : null,
    { refreshInterval: SELANG }
  );

  const { data: statusNotif } = useSWR(
    workspaceSlug ? KUNCI_JUMLAH_NOTIF : null,
    workspaceSlug ? () => getUnreadNotificationsCount(workspaceSlug) : null,
    { refreshInterval: SELANG }
  );

  const jumlahObrolan = statusObrolan?.jumlah ?? null;
  // Diambil dari jawaban SWR, BUKAN dari store MobX. Store berangkat dari nol,
  // dan nol yang berarti "belum pernah diambil" terlihat persis sama dengan nol
  // yang berarti "memang tidak ada". Bedanya baru terasa saat orang membuka
  // aplikasi dengan 12 pemberitahuan lama: dari store, angka 0 -> 12 terbaca
  // sebagai dua belas hal baru dan langsung berbunyi.
  const jumlahNotif = statusNotif?.total_unread_notifications_count ?? null;

  // Muatan PERTAMA tidak pernah berbunyi. Tanpa penjaga ini, membuka aplikasi
  // dengan tumpukan lama yang belum dibaca langsung disambut bunyi dan kartu,
  // padahal tidak ada yang baru saja terjadi.
  const obrolanSebelumnya = useRef<number | null>(null);
  const notifSebelumnya = useRef<number | null>(null);

  useEffect(() => {
    if (jumlahObrolan === null) return;
    const sebelumnya = obrolanSebelumnya.current;
    obrolanSebelumnya.current = jumlahObrolan;
    if (sebelumnya === null || jumlahObrolan <= sebelumnya) return;

    let dibatalkan = false;
    void (async () => {
      try {
        const baris = await chatService.getPercakapan(workspaceSlug);
        if (dibatalkan) return;
        const ringkas = ringkasPercakapan(baris, (id) => getWorkspaceMemberDetails(id)?.member?.display_name);
        if (!ringkas) return;
        const tujuan = ringkas.lawanBicara
          ? `/${workspaceSlug}/chat/?dengan=${ringkas.lawanBicara}`
          : `/${workspaceSlug}/chat/?ruang=${ringkas.ruangId}`;
        tampilkan({ judul: ringkas.judul, isi: ringkas.isi, tautan: tujuan }, `obrolan-${ringkas.ruangId}`);
      } catch {
        // Ditelan dengan sengaja. Angkanya sudah naik dan lencana sudah
        // memberitahukannya; gagal mengambil ISI pesan bukan alasan untuk
        // melemparkan galat ke muka orang yang cuma sedang membuka halaman lain.
      }
    })();
    return () => {
      dibatalkan = true;
    };
  }, [jumlahObrolan, workspaceSlug, getWorkspaceMemberDetails, tampilkan]);

  useEffect(() => {
    if (jumlahNotif === null) return;
    const sebelumnya = notifSebelumnya.current;
    notifSebelumnya.current = jumlahNotif;
    if (sebelumnya === null || jumlahNotif <= sebelumnya) return;

    let dibatalkan = false;
    void (async () => {
      try {
        const halaman = await notifService.fetchNotifications(workspaceSlug, {
          read: false,
          archived: false,
          snoozed: false,
          per_page: 1,
        });
        if (dibatalkan) return;
        const terbaru = halaman?.results?.[0];
        if (!terbaru) return;
        const ringkas = ringkasNotifikasi(terbaru);
        tampilkan(
          { ...ringkas, tautan: `/${workspaceSlug}/notifications` },
          `notifikasi-${terbaru.entity_identifier ?? terbaru.id}`
        );
      } catch {
        // Lihat alasan yang sama di pengintai obrolan di atas.
      }
    })();
    return () => {
      dibatalkan = true;
    };
  }, [jumlahNotif, workspaceSlug, tampilkan]);

  return <SpandukIzin />;
}

/**
 * Menawarkan izin pemberitahuan sistem, sekali, dengan cara yang bisa ditolak.
 *
 * `Notification.requestPermission()` HARUS dipanggil dari sentuhan pengguna,
 * bukan dari useEffect: Safari menolaknya diam-diam, dan Chrome memberi hukuman
 * pada situs yang meminta izin begitu halaman terbuka. Karena itu ada tombol,
 * dan bukan permintaan otomatis.
 */
function SpandukIzin() {
  const { storedValue: ditutup, setValue: setDitutup } = useLocalStorage<boolean>(KUNCI_SPANDUK, false);
  const [izin, setIzin] = useState<NotificationPermission | "tidak-ada">("tidak-ada");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setIzin(Notification.permission);
  }, []);

  if (ditutup || izin !== "default") return null;

  return (
    <div className="shadow-xl fixed right-4 bottom-4 z-[60] w-80 rounded-lg border border-subtle bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent-primary/10">
          <Bell className="size-4 text-accent-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary">Nyalakan pemberitahuan?</p>
          <p className="text-xs mt-1 text-tertiary">
            Supaya pesan baru dan tugas yang diberikan kepada Anda tetap terlihat walau tab ini sedang tidak dibuka.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                void Notification.requestPermission().then(setIzin);
              }}
            >
              Nyalakan
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDitutup(true)}>
              Nanti saja
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Tutup"
          className="text-tertiary hover:text-primary"
          onClick={() => setDitutup(true)}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
