/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker: panggilan suara & video (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Panggilan satu lawan satu lewat WebRTC.
 *
 * TANPA SERVER MEDIA, dan itu bukan penyederhanaan yang menunggu diperbaiki.
 * Untuk dua orang, WebRTC menyambungkan kedua peramban LANGSUNG. Server hanya
 * dibutuhkan untuk perkenalan awal (menukar SDP dan kandidat ICE), dan itu sudah
 * dilayani soket obrolan yang sama. Setelah tersambung, suara dan video tidak
 * pernah melewati server kita.
 *
 * ponytail: dua orang saja. Untuk tiga orang ke atas, peer-ke-peer boros karena
 * tiap orang mengirim salinan ke semua orang lain, dan jalur naiknya adalah SFU.
 * `mediasoup` itu pustaka Node yang memang dirancang ditanam ke aplikasi Express
 * yang sudah ada, jadi tempatnya nanti di dalam `apps/live`, bukan layanan baru.
 *
 * ⚠️ SEMUA INI HANYA JALAN DI DALAM JARINGAN KANTOR. Di satu LAN, kandidat host
 * sudah cukup dan STUN pun tidak diperlukan. Dari luar kantor, panggilan butuh
 * TURN untuk menembus NAT, dan lagipula servernya sendiri belum bisa dijangkau
 * dari luar. Jadi jangan mengira ini rusak kalau dicoba dari rumah.
 */

/** Di satu LAN, kandidat host sudah cukup dan itu jalur yang dipakai.
 *
 * STUN tetap dicantumkan sebagai CADANGAN, bukan jalur utama: ICE mencoba semua
 * kandidat berbarengan dan memilih pasangan tercepat, jadi kandidat host tetap
 * menang di dalam kantor. Gunanya kalau dua orang ternyata berada di segmen
 * jaringan berbeda, atau kalau peramban menyamarkan alamat lokalnya jadi nama
 * `.local` yang tidak bisa diresolusi lawan.
 *
 * Kalau internet kantor mati, ini tidak merusak apa-apa: kandidat host tetap
 * terkumpul dan panggilan di dalam LAN tetap tersambung. */
const KONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

/** Tuang kandidat yang tertahan, sekaligus.
 *
 * Urutannya tidak penting bagi WebRTC, jadi menunggunya satu per satu cuma
 * menunda saat panggilan tersambung. Kegagalan per kandidat sengaja ditelan:
 * kandidat yang sudah usang wajar ditolak, dan satu yang gagal tidak boleh
 * menjatuhkan sisanya.
 */
async function tuangKandidat(pc: RTCPeerConnection, antre: RTCIceCandidateInit[]) {
  await Promise.all(antre.map((k) => pc.addIceCandidate(new RTCIceCandidate(k)).catch(() => undefined)));
}

/**
 * `menyambungkan` ADA karena versi sebelumnya berbohong.
 *
 * Dulu status langsung jadi `tersambung` begitu SDP selesai dipertukarkan,
 * padahal saat itu ICE belum tentu berhasil menemukan jalur dan media belum
 * tentu mengalir sama sekali. Layar menulis "Tersambung" sementara kedua pihak
 * tidak mendengar apa-apa, dan yang melaporkannya hanya bisa bilang "aneh".
 *
 * Sekarang `tersambung` HANYA disetel dari `connectionState === "connected"`,
 * yaitu satu-satunya penanda bahwa jalur medianya benar-benar terbentuk.
 */
export type TStatusPanggilan = "diam" | "memanggil" | "berdering" | "menyambungkan" | "tersambung";

type TSinyal =
  | { jenis: "tawaran"; sdp: RTCSessionDescriptionInit; video: boolean }
  | { jenis: "jawaban"; sdp: RTCSessionDescriptionInit }
  | { jenis: "ice"; kandidat: RTCIceCandidateInit }
  | { jenis: "tutup" };

type Opsi = {
  /** Mengembalikan false kalau soket sedang putus. */
  kirimSinyal: (ke: string, muatan: unknown) => boolean;
  onGagal?: (pesan: string) => void;
};

export function usePanggilan({ kirimSinyal, onGagal }: Opsi) {
  const [status, setStatus] = useState<TStatusPanggilan>("diam");
  // Ditampilkan apa adanya di layar. Tanpa ini, "tersambung tapi sunyi" dan
  // "tidak pernah tersambung" tidak bisa dibedakan oleh yang melaporkannya.
  const [koneksi, setKoneksi] = useState("belum mulai");
  // Apakah track video lawan benar-benar tiba. Dipisah dari `pakaiVideo`,
  // yang hanya menyatakan panggilan ini DIMULAI sebagai panggilan video.
  const [adaVideoJauh, setAdaVideoJauh] = useState(false);
  const [lawan, setLawan] = useState<string | null>(null);
  const [pakaiVideo, setPakaiVideo] = useState(false);
  const [mikMati, setMikMati] = useState(false);
  const [kameraMati, setKameraMati] = useState(false);
  const [streamLokal, setStreamLokal] = useState<MediaStream | null>(null);
  const [streamJauh, setStreamJauh] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const lokalRef = useRef<MediaStream | null>(null);
  const lawanRef = useRef<string | null>(null);
  const tawaranMasukRef = useRef<{ sdp: RTCSessionDescriptionInit; video: boolean } | null>(null);
  /** Kandidat ICE yang tiba SEBELUM remote description dipasang.
   *
   * Ini jebakan WebRTC yang paling sering terlewat: `addIceCandidate` melempar
   * kalau remote description belum ada, dan kandidat pertama sering menyusul
   * tawaran hanya beberapa milidetik kemudian. Yang dibuang di sini biasanya
   * justru kandidat host, yaitu satu-satunya yang berguna di dalam LAN. */
  const antreIceRef = useRef<RTCIceCandidateInit[]>([]);
  const gagalRef = useRef(onGagal);
  gagalRef.current = onGagal;

  const bereskan = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    // Track WAJIB dihentikan satu per satu. Membuang referensi stream saja
    // meninggalkan lampu kamera menyala sampai tabnya ditutup.
    lokalRef.current?.getTracks().forEach((t) => t.stop());
    lokalRef.current = null;
    antreIceRef.current = [];
    tawaranMasukRef.current = null;
    lawanRef.current = null;
    setStreamLokal(null);
    setStreamJauh(null);
    setAdaVideoJauh(false);
    setStatus("diam");
    setKoneksi("belum mulai");
    setLawan(null);
    setMikMati(false);
    setKameraMati(false);
  }, []);

  const buatKoneksi = useCallback(
    (ke: string) => {
      const pc = new RTCPeerConnection(KONFIG);
      pcRef.current = pc;

      pc.onicecandidate = (ev) => {
        if (ev.candidate) kirimSinyal(ke, { jenis: "ice", kandidat: ev.candidate.toJSON() });
      };
      pc.ontrack = (ev) => {
        setStreamJauh(ev.streams[0] ?? null);
        // Ditandai dari track yang BENAR-BENAR tiba, bukan dari bendera
        // `pakaiVideo` yang cuma menyatakan niat saat panggilan dimulai.
        // Kalau video gagal dinegosiasikan, bendera tetap menyala dan layar
        // menampilkan kotak hitam yang terlihat seperti kerusakan.
        if (ev.track.kind === "video") setAdaVideoJauh(true);
        setKoneksi("media lawan diterima");
      };
      pc.oniceconnectionstatechange = () => setKoneksi("ice: " + pc.iceConnectionState);
      pc.onconnectionstatechange = () => {
        setKoneksi(pc.connectionState);
        // SATU-SATUNYA tempat status naik jadi `tersambung`.
        if (pc.connectionState === "connected") setStatus("tersambung");
        // `failed` dan `closed` saja. `disconnected` sering pulih sendiri dalam
        // beberapa detik saat jaringan berkedip, dan membereskannya di situ
        // memutus panggilan yang sebenarnya masih bisa diselamatkan.
        if (pc.connectionState === "failed") {
          // Berbicara, bukan menghilang diam-diam. Sebelumnya layar panggilan
          // sekadar lenyap tanpa keterangan, dan dari sisi pemakai itu tidak
          // bisa dibedakan dari panggilan yang ditutup lawan.
          gagalRef.current?.(
            "Tidak berhasil menyambungkan jalur suara. Biasanya jaringan kantor memblokir sambungan langsung antar-komputer."
          );
          bereskan();
        }
        if (pc.connectionState === "closed") bereskan();
      };
      return pc;
    },
    [kirimSinyal, bereskan]
  );

  const ambilMedia = useCallback(
    async (video: boolean) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
        lokalRef.current = stream;
        setStreamLokal(stream);
        setKoneksi(video ? "kamera & mik siap" : "mik siap");
        return stream;
      } catch {
        // Izin ditolak, atau tidak ada mikrofon. Dibedakan dari kegagalan
        // jaringan supaya pesannya bisa menunjuk sebabnya.
        onGagal?.("Tidak bisa memakai mikrofon atau kamera. Periksa izin peramban.");
        return null;
      }
    },
    [onGagal]
  );

  /** Mulai memanggil seseorang. */
  const panggil = useCallback(
    async (ke: string, video: boolean) => {
      if (status !== "diam") return;
      const stream = await ambilMedia(video);
      if (!stream) return;

      lawanRef.current = ke;
      setLawan(ke);
      setPakaiVideo(video);
      setStatus("memanggil");

      const pc = buatKoneksi(ke);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const tawaran = await pc.createOffer();
      await pc.setLocalDescription(tawaran);
      if (!kirimSinyal(ke, { jenis: "tawaran", sdp: tawaran, video })) {
        onGagal?.("Sambungan sedang putus. Coba lagi sebentar.");
        bereskan();
      }
    },
    [status, ambilMedia, buatKoneksi, kirimSinyal, onGagal, bereskan]
  );

  /** Angkat panggilan yang sedang berdering. */
  const angkat = useCallback(async () => {
    const masuk = tawaranMasukRef.current;
    const ke = lawanRef.current;
    if (!masuk || !ke) return;

    const stream = await ambilMedia(masuk.video);
    if (!stream) return;

    const pc = buatKoneksi(ke);

    // URUTAN INI TIDAK BOLEH DIBALIK, dan pernah terbalik sampai video tidak
    // pernah sampai ke penelepon.
    //
    // `setRemoteDescription` WAJIB lebih dulu: ia yang membentuk transceiver
    // sesuai m-line di dalam tawaran. Baru sesudah itu `addTrack` menempelkan
    // track lokal ke transceiver yang sudah ada, mengubahnya jadi dua arah.
    //
    // Kalau `addTrack` didahulukan, track lokal membuat transceiver BARU yang
    // tidak sejajar dengan tawaran. Peramban lalu memasangkan seadanya: audio
    // biasanya masih menemukan jalur dan terdengar normal, sementara video
    // tersangkut di m-line yang salah dan tidak pernah terkirim. Gejalanya
    // menyesatkan karena panggilan terasa berhasil, cuma gambarnya tidak ada.
    await pc.setRemoteDescription(new RTCSessionDescription(masuk.sdp));
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    await tuangKandidat(pc, antreIceRef.current);
    antreIceRef.current = [];

    const jawaban = await pc.createAnswer();
    await pc.setLocalDescription(jawaban);
    kirimSinyal(ke, { jenis: "jawaban", sdp: jawaban });

    tawaranMasukRef.current = null;
    // BUKAN `tersambung`. SDP sudah lengkap, tapi ICE baru mulai mencari jalur.
    // Naik ke `tersambung` ditangani `onconnectionstatechange`.
    setStatus("menyambungkan");
  }, [ambilMedia, buatKoneksi, kirimSinyal]);

  /** Tutup panggilan, baik yang sedang berdering maupun yang sedang jalan. */
  const tutup = useCallback(() => {
    const ke = lawanRef.current;
    if (ke) kirimSinyal(ke, { jenis: "tutup" });
    bereskan();
  }, [kirimSinyal, bereskan]);

  /** Sinyal masuk dari lawan bicara. Dipanggil oleh hook soket obrolan. */
  const terimaSinyal = useCallback(
    async (dari: string, muatan: unknown) => {
      const sinyal = muatan as TSinyal;
      if (!sinyal?.jenis) return;

      if (sinyal.jenis === "tawaran") {
        // Dua orang menelepon bersamaan. Yang datang belakangan ditolak, bukan
        // dibiarkan menimpa: menerima dua tawaran sekaligus menghasilkan satu
        // koneksi yang tidak pernah selesai dan tidak bisa ditutup dari UI.
        if (status !== "diam") {
          kirimSinyal(dari, { jenis: "tutup" });
          return;
        }
        tawaranMasukRef.current = { sdp: sinyal.sdp, video: sinyal.video };
        lawanRef.current = dari;
        setLawan(dari);
        setPakaiVideo(sinyal.video);
        setStatus("berdering");
        return;
      }

      if (sinyal.jenis === "jawaban") {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sinyal.sdp));
        await tuangKandidat(pc, antreIceRef.current);
        antreIceRef.current = [];
        // Jawaban diterima, tapi jalur medianya belum tentu ada.
        setStatus("menyambungkan");
        return;
      }

      if (sinyal.jenis === "ice") {
        const pc = pcRef.current;
        // Belum ada remote description: disimpan dulu, jangan dibuang.
        if (!pc || !pc.remoteDescription) {
          antreIceRef.current.push(sinyal.kandidat);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(sinyal.kandidat));
        } catch {
          // Kandidat yang sudah usang wajar ditolak dan tidak perlu diributkan.
        }
        return;
      }

      if (sinyal.jenis === "tutup") bereskan();
    },
    [status, kirimSinyal, bereskan]
  );

  /** Lawan bicara menutup tab. Sama artinya dengan menutup panggilan. */
  const lawanPergi = useCallback(
    (dari: string) => {
      if (lawanRef.current === dari) bereskan();
    },
    [bereskan]
  );

  const setelMik = useCallback((mati: boolean) => {
    lokalRef.current?.getAudioTracks().forEach((t) => (t.enabled = !mati));
    setMikMati(mati);
  }, []);

  const setelKamera = useCallback((mati: boolean) => {
    lokalRef.current?.getVideoTracks().forEach((t) => (t.enabled = !mati));
    setKameraMati(mati);
  }, []);

  // Lampu kamera harus padam walau komponennya dilepas mendadak, misalnya saat
  // orang berpindah halaman di tengah panggilan.
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
    panggil,
    angkat,
    tutup,
    terimaSinyal,
    lawanPergi,
    setelMik,
    setelKamera,
  };
}
