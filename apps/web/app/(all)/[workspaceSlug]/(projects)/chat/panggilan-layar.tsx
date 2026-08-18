/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: layar panggilan (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { Avatar } from "@plane/propel/avatar";
import { getFileURL } from "@plane/utils";
import type { TStatusPanggilan } from "./panggilan";
import { tataPanggilan } from "./tata-panggilan";

type Props = {
  status: TStatusPanggilan;
  koneksi: string;
  namaLawan: string;
  avatarLawan?: string;
  pakaiVideo: boolean;
  mikMati: boolean;
  kameraMati: boolean;
  streamLokal: MediaStream | null;
  streamJauh: MediaStream | null;
  adaVideoJauh: boolean;
  byteMasuk: { audio: number; video: number };
  onAngkat: () => void;
  onTutup: () => void;
  onSetelMik: (mati: boolean) => void;
  onSetelKamera: (mati: boolean) => void;
};

/**
 * Satu elemen media yang memegang streamnya sendiri.
 *
 * KENAPA KOMPONEN SENDIRI, dan ini pernah salah sampai panggilan tidak
 * mengeluarkan suara maupun gambar sama sekali:
 *
 * Versi sebelumnya memasang `srcObject` lewat useEffect di komponen induk,
 * sementara elemen videonya dirender BERSYARAT (hanya saat status `tersambung`).
 * Urutannya jadi mematikan. Saat stream kamera didapat, elemennya belum ada
 * sehingga ref-nya null dan efeknya tidak berbuat apa-apa. Saat elemennya
 * akhirnya dirender, efeknya tidak jalan lagi karena dependensinya tidak
 * berubah. `srcObject` tidak pernah terpasang, dan tidak ada satu pun error
 * yang muncul: panggilan terlihat tersambung, tapi sunyi dan gelap.
 *
 * Di sini elemennya selalu ikut siklus hidup komponen ini dan efeknya
 * bergantung pada streamnya, jadi keduanya tidak bisa lagi saling mendahului.
 */
function Media({ stream, className, bisu = false }: { stream: MediaStream | null; className: string; bisu?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.srcObject === stream) return;
    el.srcObject = stream;
    // Kebijakan autoplay peramban bisa menolak pemutaran tanpa gestur.
    // Panggilan selalu dimulai dari klik jadi normalnya lolos; ditangkap supaya
    // penolakannya tidak jatuh sebagai unhandled rejection yang tak terlihat.
    void el.play().catch(() => undefined);
  }, [stream]);

  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <video ref={ref} autoPlay playsInline muted={bisu} className={className} />;
}

export function PanggilanLayar({
  status,
  koneksi,
  namaLawan,
  avatarLawan,
  pakaiVideo,
  mikMati,
  kameraMati,
  streamLokal,
  streamJauh,
  adaVideoJauh,
  byteMasuk,
  onAngkat,
  onTutup,
  onSetelMik,
  onSetelKamera,
}: Props) {
  // Keputusan apa yang tampil hidup di `tata-panggilan.ts` sebagai fungsi murni,
  // supaya bisa diuji tanpa DOM. Aturan terpentingnya, elemen media lawan selalu
  // terpasang, pernah dilanggar dan membuat panggilan sunyi total.
  const tata = tataPanggilan(status, pakaiVideo, Boolean(streamLokal), adaVideoJauh);
  if (!tata.tampil) return null;

  const keterangan =
    status === "berdering"
      ? "Memanggil Anda"
      : status === "memanggil"
        ? "Menunggu dijawab..."
        : status === "menyambungkan"
          ? "Menyambungkan jalur suara..."
          : "Tersambung";

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/85 p-6">
      <div className="relative flex min-h-0 w-full max-w-3xl flex-1 items-center justify-center">
        {/* Media lawan SELALU terpasang, termasuk saat panggilan suara. Kalau ia
            ikut dirender bersyarat, suaranya tidak keluar karena elemennya belum
            ada saat aliran audio pertama tiba. */}
        <Media
          stream={streamJauh}
          className={tata.gambarLawanTerlihat ? "max-h-full w-full rounded-lg bg-black object-contain" : "hidden"}
        />

        {!tata.gambarLawanTerlihat ? (
          <Avatar name={namaLawan} src={getFileURL(avatarLawan ?? "")} size={80} shape="circle" />
        ) : null}

        {/* Pratinjau diri tampil SEJAK MEMANGGIL, bukan setelah tersambung.
            Kalau kameranya bermasalah, orang tahu sejak detik pertama alih-alih
            menunggu panggilan yang memang tidak akan menampilkan apa pun.
            Selalu dibisukan supaya suara sendiri tidak menggema. */}
        {tata.pratinjauDiriTerlihat ? (
          <Media
            stream={streamLokal}
            bisu
            className="shadow-lg absolute right-3 bottom-3 w-32 rounded-md border border-white/20 bg-black object-cover"
          />
        ) : null}
      </div>

      <p className="text-lg mt-5 font-medium text-white">{namaLawan}</p>
      <p className="text-sm mt-1 text-white/60">{keterangan}</p>
      {/* Keadaan koneksi ditampilkan apa adanya. Tanpa ini, "tersambung tapi
          sunyi" dan "tidak pernah tersambung" terlihat persis sama dari layar,
          dan yang melapor tidak punya kata untuk membedakannya. */}
      {/* Angka byte adalah SATU-SATUNYA bukti media benar-benar mengalir.
          Status koneksi, track yang tiba, bahkan tulisan "Tersambung" semuanya
          bisa terlihat benar sementara nol byte berpindah. */}
      <p className="text-xs mt-1 text-white/35">
        {koneksi}
        {streamLokal ? " · mik siap" : " · mik BELUM siap"}
        {" · masuk "}
        {Math.round(byteMasuk.audio / 1024)} KB audio
        {" / "}
        {Math.round(byteMasuk.video / 1024)} KB video
      </p>
      {status === "tersambung" && byteMasuk.audio === 0 && byteMasuk.video === 0 ? (
        <p className="text-xs text-amber-300/80 mt-2 max-w-md text-center">
          Jalur terbentuk tapi belum ada data yang masuk. Kalau angka di atas tetap nol beberapa detik, lalu lintas
          media sedang diblokir jaringan.
        </p>
      ) : null}

      <div className="mt-7 flex items-center gap-3">
        {status === "berdering" ? (
          <>
            <button
              type="button"
              onClick={onAngkat}
              aria-label="Angkat panggilan"
              className="bg-green-600 hover:bg-green-500 flex size-14 items-center justify-center rounded-full text-white"
            >
              <Phone className="size-6" />
            </button>
            <button
              type="button"
              onClick={onTutup}
              aria-label="Tolak panggilan"
              className="bg-red-600 hover:bg-red-500 flex size-14 items-center justify-center rounded-full text-white"
            >
              <PhoneOff className="size-6" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onSetelMik(!mikMati)}
              aria-label={mikMati ? "Nyalakan mikrofon" : "Matikan mikrofon"}
              className="flex size-12 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              {mikMati ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
            {pakaiVideo ? (
              <button
                type="button"
                onClick={() => onSetelKamera(!kameraMati)}
                aria-label={kameraMati ? "Nyalakan kamera" : "Matikan kamera"}
                className="flex size-12 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                {kameraMati ? <VideoOff className="size-5" /> : <Video className="size-5" />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onTutup}
              aria-label="Akhiri panggilan"
              className="bg-red-600 hover:bg-red-500 flex size-14 items-center justify-center rounded-full text-white"
            >
              <PhoneOff className="size-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
