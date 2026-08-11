/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker — Settings Akses Wiki per-folder (Yorukaze Production)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { FolderLock } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { WikiAccessService, type TWikiAccessState } from "@/services/wiki_access.service";

const wikiAccessService = new WikiAccessService();

const toastError = (err: unknown, fallback: string) => {
  const message = (err as { error?: string })?.error ?? fallback;
  setToast({ type: TOAST_TYPE.ERROR, title: "Gagal", message });
};

function WikiAccessSettingsPage() {
  const { workspaceSlug, projectId } = useParams();
  // store
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  // state
  const [state, setState] = useState<TWikiAccessState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingFolderId, setSavingFolderId] = useState<string | null>(null);

  const canAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails.name} - Akses Wiki` : undefined;

  const fetchState = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      setState(await wikiAccessService.fetchState(workspaceSlug.toString(), projectId.toString()));
    } catch (err) {
      // Jangan telan diam-diam: tanpa alasan, "tidak bisa memuat" menyisakan
      // tebak-tebakan antara tidak punya izin, project salah, atau API mati.
      toastError(err, "Tidak bisa memuat pengaturan akses Wiki.");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const handleToggleGovernance = async (next: boolean) => {
    if (!workspaceSlug || !projectId) return;
    try {
      await wikiAccessService.setGoverned(workspaceSlug.toString(), projectId.toString(), next);
      await fetchState();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Tersimpan",
        message: next
          ? "Akses per-folder aktif. Folder tanpa pemilik hanya bisa diedit admin project."
          : "Akses per-folder dimatikan. Izin halaman kembali mengikuti peran project.",
      });
    } catch (err) {
      toastError(err, "Gagal mengubah status akses per-folder.");
    }
  };

  const handleToggleDivision = async (folderId: string, divisionId: string, checked: boolean) => {
    if (!workspaceSlug || !projectId || !state) return;
    const folder = state.folders.find((f) => f.id === folderId);
    if (!folder) return;

    const current = folder.divisions.map((d) => d.id);
    const next = checked ? [...current, divisionId] : current.filter((id) => id !== divisionId);

    setSavingFolderId(folderId);
    try {
      const updated = await wikiAccessService.setFolderDivisions(
        workspaceSlug.toString(),
        projectId.toString(),
        folderId,
        next
      );
      // Ganti folder yang berubah saja, jangan muat ulang seluruh halaman.
      setState((prev) =>
        prev
          ? {
              ...prev,
              folders: prev.folders.map((f) => (f.id === folderId ? { ...f, divisions: updated.divisions } : f)),
            }
          : prev
      );
    } catch (err) {
      toastError(err, "Gagal menyimpan pemilik folder.");
    } finally {
      setSavingFolderId(null);
    }
  };

  if (workspaceUserInfo && !canAdmin) {
    return <NotAuthorizedView section="settings" isProjectView />;
  }
  if (!workspaceSlug || !projectId) return <></>;

  return (
    <SettingsContentWrapper>
      <PageHead title={pageTitle} />
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-1 border-b border-subtle pb-3">
          <div className="flex items-center gap-2">
            <FolderLock className="size-5 text-secondary" />
            <h3 className="text-xl font-medium text-primary">Akses Wiki per Folder</h3>
          </div>
          <p className="text-sm text-tertiary">
            Semua anggota project tetap bisa membaca seluruh Wiki. Yang diatur di sini adalah siapa yang boleh mengedit:
            hanya anggota divisi pemilik folder. Sub-halaman mengikuti folder induknya, dan admin project selalu bisa
            mengedit.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-tertiary">Memuat…</p>
        ) : !state ? (
          <p className="text-sm text-tertiary">Tidak bisa memuat pengaturan akses Wiki.</p>
        ) : (
          <>
            {/* Keterangan sengaja di luar <label>: kalau ikut di dalam, screen
                reader membacakan seluruh paragraf sebagai nama checkbox-nya. */}
            <div className="flex flex-col gap-1 rounded-md border border-subtle px-3 py-2.5">
              <label className="text-sm flex items-center gap-2.5 font-medium text-primary">
                <input
                  type="checkbox"
                  checked={state.is_governed}
                  onChange={(e) => void handleToggleGovernance(e.target.checked)}
                  className="size-4"
                />
                Aktifkan akses per folder di project ini
              </label>
              <p className="text-xs pl-6 text-tertiary">
                Saat mati, project ini memakai izin halaman bawaan (semua member bisa mengedit).
              </p>
            </div>

            {state.is_governed && (
              <div className="flex flex-col gap-2">
                {state.folders.length === 0 ? (
                  <p className="text-sm text-tertiary">Belum ada folder (halaman tingkat teratas) di project ini.</p>
                ) : (
                  state.folders.map((folder) => {
                    const owned = new Set(folder.divisions.map((d) => d.id));
                    return (
                      <div key={folder.id} className="rounded-md border border-subtle px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-primary">{folder.name}</span>
                          {savingFolderId === folder.id ? (
                            <span className="text-xs text-tertiary">menyimpan…</span>
                          ) : (
                            owned.size === 0 && <span className="text-xs text-tertiary">admin saja</span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                          {state.available_divisions.map((division) => (
                            <label
                              key={division.id}
                              className="text-xs flex items-center gap-1.5 text-secondary"
                              title={division.name}
                            >
                              <input
                                type="checkbox"
                                checked={owned.has(division.id)}
                                disabled={savingFolderId === folder.id}
                                onChange={(e) => void handleToggleDivision(folder.id, division.id, e.target.checked)}
                                className="size-3.5"
                              />
                              {division.identifier}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(WikiAccessSettingsPage);
