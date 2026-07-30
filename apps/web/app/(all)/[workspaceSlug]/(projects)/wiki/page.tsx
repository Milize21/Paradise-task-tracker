/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker — pintasan Wiki (B.E.R)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Navigate, useParams } from "react-router";
// hooks
import { useProject } from "@/hooks/store/use-project";

// Wiki perusahaan adalah project biasa ber-identifier WIKI. Halaman ini SENGAJA
// ada supaya item sidebar bisa memakai href statis `/wiki/`: UUID project
// berbeda di tiap instance, jadi menaruhnya di konstanta akan salah begitu
// dipasang di server produksi. Di sini UUID-nya diresolusi saat runtime.
const WIKI_PROJECT_IDENTIFIER = "WIKI";

function WikiRedirectPage() {
  const { workspaceSlug } = useParams();
  const { getProjectByIdentifier, loader } = useProject();

  const wikiProject = getProjectByIdentifier(WIKI_PROJECT_IDENTIFIER);

  if (wikiProject) {
    return <Navigate to={`/${workspaceSlug}/projects/${wikiProject.id}/pages/`} replace />;
  }

  // Daftar project belum selesai dimuat: jangan tampilkan "tidak ditemukan"
  // yang menyesatkan hanya karena datanya belum sampai.
  if (loader === "init-loader") return null;

  return (
    <div className="flex h-full w-full items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <h2 className="text-lg font-semibold text-primary">Wiki belum tersedia</h2>
        <p className="text-sm mt-1 text-secondary">
          Project dengan identifier <span className="font-mono">{WIKI_PROJECT_IDENTIFIER}</span> tidak ditemukan di
          workspace ini, atau kamu belum menjadi anggotanya. Hubungi admin workspace.
        </p>
      </div>
    </div>
  );
}

export default observer(WikiRedirectPage);
