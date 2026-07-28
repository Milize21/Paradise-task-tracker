/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * Kustomisasi Paradise Task Tracker — ACL folder Wiki (B.E.R)
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

export type TWikiDivision = {
  id: string;
  identifier: string;
  name: string;
};

export type TWikiFolder = {
  id: string;
  name: string;
  divisions: TWikiDivision[];
};

export type TWikiAccessState = {
  is_governed: boolean;
  folders: TWikiFolder[];
  available_divisions: TWikiDivision[];
};

export class WikiAccessService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchState(workspaceSlug: string, projectId: string): Promise<TWikiAccessState> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/wiki-access/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async setGoverned(workspaceSlug: string, projectId: string, isGoverned: boolean): Promise<{ is_governed: boolean }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/wiki-access/`, {
      is_governed: isGoverned,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Mengganti seluruh daftar divisi pemilik folder (bukan menambah satu per satu). */
  async setFolderDivisions(
    workspaceSlug: string,
    projectId: string,
    folderId: string,
    divisionIds: string[]
  ): Promise<TWikiFolder> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/wiki-access/folders/${folderId}/`, {
      division_ids: divisionIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
