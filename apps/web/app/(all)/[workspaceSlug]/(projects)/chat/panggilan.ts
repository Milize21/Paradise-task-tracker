/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: panggilan suara & video (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import { ChatService } from "@/services/chat.service";

const chatService = new ChatService();

/**
 * Panggilan lewat LiveKit, bukan peer ke peer.
 *
 * KENAPA DITULIS ULANG
 * Versi pertama memakai RTCPeerConnection langsung, dua peramban saling
 * menyambung. Secara teori itu cukup untuk dua orang di satu kantor. Dalam
 * praktik ia gagal berulang kali, dan sebab terdalamnya tidak bisa diperbaiki
 * dari sisi kode: peer ke peer menuntut kedua KOMPUTER bisa saling menghubungi
 * langsung, dan jaringan kantor ini tidak mengizinkannya.
 *
 * LiveKit membalik arahnya. Ia SFU: kedua peramban menyambung KE SERVER, lalu
 * server meneruskan media. Jalur komputer ke server sudah pasti terbuka, karena
 * aplikasinya sendiri berjalan lewat jalur itu.
 *
 * Yang ikut hilang bersama peer ke peer, dan TIAP SATUNYA pernah jadi bug nyata
 * di versi buatan sendiri: urutan setRemoteDescription dan addTrack, antrean
 * kandidat ICE yang tiba terlalu dini, perakitan stream jauh saat track datang
 * tanpa stream, tabrakan saat dua orang menelepon bersamaan, dan sambung ulang
 * ketika jaringan berkedip. Semuanya sudah ditangani klien LiveKit.
 *
 * YANG TETAP MILIK KITA: dering. LiveKit tidak punya konsep "sedang dipanggil",
 * ia hanya tahu ruang yang bisa dimasuki. Jadi undangan tetap lewat soket
 * obrolan, dan itu memang tempatnya, karena hak menelepon sama persis dengan
 * hak membaca ruangnya.
 */

export type TStatusPanggilan = "diam" | "memanggil" | "berdering" | "menyambungkan" | "tersambung";

type TSinyal = { jenis: "panggil"; video: boolean } | { jenis: "tolak" } | { jenis: "tutup" };

type Opsi = {
  slug?: string;
  /** Ruang obrolan yang sedang dibuka. Panggilan selalu terjadi di dalamnya. */
  ruangId?: string | null;
  /** Mengembalikan false kalau soket sedang putus. */
  kirimSinyal: (ke: string, muatan: unknown) => boolean;
  onGagal?: (pesan: string) => void;
};

export function usePanggilan({ slug, ruangId, kirimSinyal, onGagal }: Opsi) {
  const [status, setStatus] = useState<TStatusPanggilan>("diam");
  const [koneksi, setKoneksi] = useState("belum mulai");
  const [lawan, setLawan] = useState<string | null>(null);
  const [pakaiVideo, setPakaiVideo] = useState(false);
  const [mikMati, setMikMati] = useState(false);
  const [kameraMati, setKameraMati] = useState(false);
  const [streamLokal, setStreamLokal] = useState<MediaStream | null>(null);
  const [streamJauh, setStreamJauh] = useState<MediaStream | null>(null);
  const [adaVideoJauh, setAdaVideoJauh] = useState(false);
  const [byteMasuk, setByteMasuk] = useState({ audio: 0, video: 0 });

  const roomRef = useRef<Room | null>(null);
  const lawanRef = useRef<string | null>(null);
  const gagalRef = useRef(onGagal);
  gagalRef.current = onGagal;

  const bereskan = useCallback(() => {
    // `disconnect()` menghentikan track lokal, menutup sambungan, dan melepas
    // seluruh listener sekaligus. Satu panggilan yang menggantikan pembersihan
    // manual yang dulu panjang dan mudah terlewat separuh, meninggalkan lampu
    // kamera menyala sampai tabnya ditutup.
    void roomRef.current?.disconnect();
    roomRef.current = null;
    lawanRef.current = null;
    setStatus("diam");
    setKoneksi("belum mulai");
    setLawan(null);
    setStreamLokal(null);
    setStreamJauh(null);
    setAdaVideoJauh(false);
    setMikMati(false);
    setKameraMati(false);
    setByteMasuk({ audio: 0, video: 0 });
  }, []);

  /** Rakit ulang stream jauh dari seluruh track yang sedang berlangganan. */
  const susunStreamJauh = useCallback((room: Room) => {
    const track: MediaStreamTrack[] = [];
    let adaVideo = false;
    room.remoteParticipants.forEach((peserta) => {
      peserta.trackPublications.forEach((pub) => {
        const mst = pub.track?.mediaStreamTrack;
        if (!mst) return;
        track.push(mst);
        if (pub.kind === Track.Kind.Video) adaVideo = true;
      });
    });
    setAdaVideoJauh(adaVideo);
    setStreamJauh(track.length > 0 ? new MediaStream(track) : null);
  }, []);

  /** Sambung ke ruang panggilan dan mulai mengirim media. */
  const masukRuang = useCallback(
    async (video: boolean) => {
      if (!slug || !ruangId) {
        gagalRef.current?.("Percakapan ini belum punya ruang panggilan.");
        return null;
      }

      let izin: { url: string; token: string };
      try {
        izin = await chatService.getTokenPanggilan(slug, ruangId);
      } catch (e) {
        gagalRef.current?.((e as { error?: string })?.error ?? "Tidak bisa memulai panggilan. Coba lagi sebentar.");
        return null;
      }

      // `adaptiveStream` dan `dynacast` menurunkan kualitas otomatis saat
      // jaringan memburuk, alih-alih memutus panggilan. Untuk dua orang
      // biayanya nyaris nol.
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room
        .on(RoomEvent.ConnectionStateChanged, (s: ConnectionState) => setKoneksi(String(s)))
        .on(RoomEvent.Connected, () => setStatus("tersambung"))
        .on(RoomEvent.TrackSubscribed, () => susunStreamJauh(room))
        .on(RoomEvent.TrackUnsubscribed, () => susunStreamJauh(room))
        .on(RoomEvent.ParticipantDisconnected, () => {
          // Untuk panggilan berdua, lawan yang keluar berarti panggilan selesai.
          if (room.remoteParticipants.size === 0) bereskan();
        })
        .on(RoomEvent.Disconnected, () => bereskan());

      try {
        await room.connect(izin.url, izin.token);
        await room.localParticipant.setMicrophoneEnabled(true);
        if (video) await room.localParticipant.setCameraEnabled(true);
      } catch {
        gagalRef.current?.("Gagal menyambung ke server panggilan. Periksa jaringan kantor.");
        bereskan();
        return null;
      }

      const lokal: MediaStreamTrack[] = [];
      room.localParticipant.trackPublications.forEach((pub) => {
        if (pub.track?.mediaStreamTrack) lokal.push(pub.track.mediaStreamTrack);
      });
      setStreamLokal(lokal.length > 0 ? new MediaStream(lokal) : null);

      return room;
    },
    [slug, ruangId, susunStreamJauh, bereskan]
  );

  const panggil = useCallback(
    async (ke: string, video: boolean) => {
      if (status !== "diam") return;
      lawanRef.current = ke;
      setLawan(ke);
      setPakaiVideo(video);
      setStatus("menyambungkan");

      const room = await masukRuang(video);
      if (!room) return;

      if (!kirimSinyal(ke, { jenis: "panggil", video })) {
        gagalRef.current?.("Sambungan sedang putus. Coba lagi sebentar.");
        bereskan();
        return;
      }
      setStatus("memanggil");
    },
    [status, masukRuang, kirimSinyal, bereskan]
  );

  const angkat = useCallback(async () => {
    if (!lawanRef.current || status !== "berdering") return;
    setStatus("menyambungkan");
    await masukRuang(pakaiVideo);
  }, [status, pakaiVideo, masukRuang]);

  const tutup = useCallback(() => {
    const ke = lawanRef.current;
    if (ke) kirimSinyal(ke, { jenis: status === "berdering" ? "tolak" : "tutup" });
    bereskan();
  }, [status, kirimSinyal, bereskan]);

  const terimaSinyal = useCallback(
    async (dari: string, muatan: unknown) => {
      const sinyal = muatan as TSinyal;
      if (!sinyal?.jenis) return;

      if (sinyal.jenis === "panggil") {
        // Dua orang menelepon bersamaan: yang datang belakangan ditolak, bukan
        // dibiarkan menimpa panggilan yang sedang berjalan.
        if (status !== "diam") {
          kirimSinyal(dari, { jenis: "tolak" });
          return;
        }
        lawanRef.current = dari;
        setLawan(dari);
        setPakaiVideo(sinyal.video);
        setStatus("berdering");
        return;
      }

      if (sinyal.jenis === "tolak" || sinyal.jenis === "tutup") bereskan();
    },
    [status, kirimSinyal, bereskan]
  );

  const lawanPergi = useCallback(
    (dari: string) => {
      if (lawanRef.current === dari) bereskan();
    },
    [bereskan]
  );

  const setelMik = useCallback((mati: boolean) => {
    void roomRef.current?.localParticipant.setMicrophoneEnabled(!mati);
    setMikMati(mati);
  }, []);

  const setelKamera = useCallback((mati: boolean) => {
    void roomRef.current?.localParticipant.setCameraEnabled(!mati);
    setKameraMati(mati);
  }, []);

  /** Byte yang BENAR-BENAR masuk, dibaca dari statistik WebRTC.
   *
   * Status koneksi dan track yang tiba dua-duanya bisa terlihat benar sementara
   * nol byte berpindah, dan itu sudah pernah menyesatkan diagnosis di sini.
   * Angka ini satu-satunya yang tidak bisa dibantah tampilan apa pun.
   */
  useEffect(() => {
    if (status !== "tersambung") return undefined;

    const id = setInterval(() => {
      const room = roomRef.current;
      if (!room) return;

      const tugas: Promise<{ audio: number; video: number }>[] = [];
      room.remoteParticipants.forEach((peserta) => {
        peserta.trackPublications.forEach((pub) => {
          const t = pub.track;
          if (!t) return;
          tugas.push(
            t
              .getRTCStatsReport()
              .then((laporan) => {
                let audio = 0;
                let video = 0;
                laporan?.forEach((baris: { type?: string; kind?: string; bytesReceived?: number }) => {
                  if (baris.type !== "inbound-rtp") return;
                  if (baris.kind === "audio") audio += baris.bytesReceived ?? 0;
                  if (baris.kind === "video") video += baris.bytesReceived ?? 0;
                });
                return { audio, video };
              })
              .catch(() => ({ audio: 0, video: 0 }))
          );
        });
      });

      void Promise.all(tugas).then((hasil) => {
        setByteMasuk({
          audio: hasil.reduce((n, h) => n + h.audio, 0),
          video: hasil.reduce((n, h) => n + h.video, 0),
        });
        return undefined;
      });
    }, 2000);

    return () => clearInterval(id);
  }, [status]);

  // Panggilan tidak boleh hidup lebih lama dari halamannya.
  useEffect(() => () => bereskan(), [bereskan]);

  return {
    status,
    koneksi,
    lawan,
    pakaiVideo,
    mikMati,
    kameraMati,
    streamLokal,
    streamJauh,
    adaVideoJauh,
    byteMasuk,
    panggil,
    angkat,
    tutup,
    terimaSinyal,
    lawanPergi,
    setelMik,
    setelKamera,
  };
}
