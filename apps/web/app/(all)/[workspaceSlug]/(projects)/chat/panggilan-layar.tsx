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

type Props = {
  status: TStatusPanggilan;
  namaLawan: string;
  avatarLawan?: string;
  pakaiVideo: boolean;
  mikMati: boolean;
  kameraMati: boolean;
  streamLokal: MediaStream | null;
  streamJauh: MediaStream | null;
  onAngkat: () => void;
  onTutup: () => void;
  onSetelMik: (mati: boolean) => void;
  onSetelKamera: (mati: boolean) => void;
};

/** Pasang MediaStream ke elemen video.
 *
 * `srcObject` tidak bisa lewat atribut JSX, harus disetel dari kode. Memakai
 * `src` dengan object URL sudah lama tidak dianjurkan dan bocor memori. */
function useStream(ref: React.RefObject<HTMLVideoElement | null>, stream: MediaStream | null) {
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [ref, stream]);
}

export function PanggilanLayar({
  status,
  namaLawan,
  avatarLawan,
  pakaiVideo,
  mikMati,
  kameraMati,
  streamLokal,
  streamJauh,
  onAngkat,
  onTutup,
  onSetelMik,
  onSetelKamera,
}: Props) {
  const jauhRef = useRef<HTMLVideoElement>(null);
  const lokalRef = useRef<HTMLVideoElement>(null);
  useStream(jauhRef, streamJauh);
  useStream(lokalRef, streamLokal);

  if (status === "diam") return null;

  const keterangan =
    status === "berdering" ? "Memanggil Anda" : status === "memanggil" ? "Menunggu dijawab..." : "Tersambung";

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/85 p-6">
      {/* Video hanya ditampilkan setelah tersambung. Sebelum itu belum ada
          gambar dari lawan, dan kotak hitam kosong terlihat seperti kerusakan. */}
      {status === "tersambung" && pakaiVideo ? (
        <div className="relative flex min-h-0 w-full max-w-3xl flex-1 items-center justify-center">
          {/* Tanpa <track>: ini aliran langsung dari kamera lawan bicara, dan
              tidak ada berkas takarir yang bisa disediakan untuknya. Aturan
              media-has-caption ditujukan untuk media rekaman. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={jauhRef} autoPlay playsInline className="max-h-full w-full rounded-lg bg-black object-contain" />
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={lokalRef}
            autoPlay
            playsInline
            muted
            className="shadow-lg absolute right-3 bottom-3 w-32 rounded-md border border-white/20 bg-black object-cover"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Avatar name={namaLawan} src={getFileURL(avatarLawan ?? "")} size={80} shape="circle" />
          {/* Audio lawan tetap harus dipasang walau tanpa video, kalau tidak
              panggilan tersambung tapi tidak ada suara sama sekali. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={jauhRef} autoPlay playsInline className="hidden" />
        </div>
      )}

      <p className="text-lg mt-5 font-medium text-white">{namaLawan}</p>
      <p className="text-sm mt-1 text-white/60">{keterangan}</p>

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
