# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker — URL fitur kustom (B.E.R)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import DivisionDashboardEndpoint, WorkLogExportEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/divisi-dashboard/",
        DivisionDashboardEndpoint.as_view(),
        name="divisi-dashboard",
    ),
    path(
        "workspaces/<str:slug>/worklogs/export/",
        WorkLogExportEndpoint.as_view(),
        name="worklogs-export",
    ),
]
