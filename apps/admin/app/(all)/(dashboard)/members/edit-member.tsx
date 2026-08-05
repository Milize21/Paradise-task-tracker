/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker — ubah member di God Mode (B.E.R)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { Button } from "@plane/propel/button";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { InstanceMemberService, type TInstanceMember, type TMemberUpdate } from "@plane/services";
// local
import { inputClass, PERAN, PERAN_DEFAULT } from "./constants";

const memberService = new InstanceMemberService();

type Props = {
  member: TInstanceMember;
  onSelesai: () => Promise<unknown>;
  onTutup: () => void;
};

export function EditMember({ member, onSelesai, onTutup }: Props) {
  const [nama, setNama] = useState(member.display_name);
  const [email, setEmail] = useState(member.email);
  const [peran, setPeran] = useState(member.workspace_role ?? PERAN_DEFAULT);
  const [password, setPassword] = useState("");
  const [sibuk, setSibuk] = useState(false);

  // Kirim HANYA yang berubah. Mengirim semua kolom berarti setiap simpan
  // menulis ulang email & peran walau yang diubah cuma namanya — dan setiap
  // tulis-ulang email mengakhiri sesi orangnya tanpa alasan.
  const perubahan = (): TMemberUpdate => {
    const patch: TMemberUpdate = {};
    if (nama.trim() && nama.trim() !== member.display_name) patch.display_name = nama.trim();
    if (email.trim().toLowerCase() !== member.email.toLowerCase()) patch.email = email.trim().toLowerCase();
    if (peran !== member.workspace_role) patch.workspace_role = peran;
    if (password) patch.password = password;
    return patch;
  };

  const handleSimpan = async () => {
    const patch = perubahan();
    if (Object.keys(patch).length === 0) {
      onTutup();
      return;
    }

    setSibuk(true);
    try {
      const hasil = await memberService.update(member.id, patch);
      setPassword("");
      await onSelesai();
      onTutup();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Tersimpan",
        message: hasil.sessions_ended
          ? `${hasil.display_name} — ${hasil.sessions_ended} sesi diakhiri, dia harus masuk lagi.`
          : hasil.display_name,
      });
    } catch (err) {
      const message = (err as { error?: string })?.error ?? "Tidak bisa menyimpan perubahan.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Gagal", message });
    } finally {
      setSibuk(false);
    }
  };

  const passwordTerlaluPendek = password.length > 0 && password.length < 8;

  return (
    <div className="space-y-3 border-t border-subtle bg-layer-1 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="block text-11 text-secondary">Nama</span>
          <input className={`${inputClass} w-full`} value={nama} onChange={(e) => setNama(e.target.value)} />
        </label>

        <label className="space-y-1">
          <span className="block text-11 text-secondary">Email (identitas login)</span>
          <input
            className={`${inputClass} w-full`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="space-y-1">
          <span className="block text-11 text-secondary">Hak akses workspace</span>
          <select className={`${inputClass} w-full`} value={peran} onChange={(e) => setPeran(Number(e.target.value))}>
            {Object.entries(PERAN).map(([nilai, label]) => (
              <option key={nilai} value={nilai}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-11 text-secondary">Password baru</span>
          <input
            className={`${inputClass} w-full`}
            type="password"
            placeholder="kosongkan = tidak diubah"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>

      {passwordTerlaluPendek && <p className="text-danger text-11">Password minimal 8 karakter.</p>}

      <p className="text-11 text-secondary">
        Mengubah <strong>password</strong> atau <strong>email</strong> mengakhiri semua sesi orang itu — dia harus masuk
        lagi. Password barunya sampaikan langsung; SMTP belum jalan, tidak ada email yang terkirim.
      </p>

      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={sibuk || passwordTerlaluPendek} onClick={handleSimpan}>
          Simpan
        </Button>
        <Button variant="secondary" size="sm" disabled={sibuk} onClick={onTutup}>
          Batal
        </Button>
      </div>
    </div>
  );
}
