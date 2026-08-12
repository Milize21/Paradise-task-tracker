# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker: URL fitur kustom (Yorukaze Production)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    ProjectTrashEndpoint,
    DivisionDashboardEndpoint,
    WorkLogExportEndpoint,
    GoogleCalendarCallbackEndpoint,
    GoogleCalendarConnectEndpoint,
    GoogleCalendarStatusEndpoint,
    InitiativeViewSet,
    PageCanEditEndpoint,
    WikiAccessEndpoint,
    WikiFolderAccessEndpoint,
)

urlpatterns = [
    # Google Calendar. Callback-nya SENGAJA di bawah /api/, bukan /auth/:
    # /auth/ dimiliki berkas URL upstream, dan menyisipkan satu baris di sana
    # menambah permukaan konflik tiap kali upstream sync dijalankan.
    #
    # ⚠️ Nilai persis di bawah ini harus didaftarkan sebagai Authorized redirect
    # URI di Google Cloud Console. Beda satu garis miring pun ditolak dengan
    # `redirect_uri_mismatch`, dan pesannya tidak menyebut bagian mana yang beda:
    #   https://<host>/api/google-calendar/callback/
    path(
        "google-calendar/connect/",
        GoogleCalendarConnectEndpoint.as_view(),
        name="google-calendar-connect",
    ),
    path(
        "google-calendar/callback/",
        GoogleCalendarCallbackEndpoint.as_view(),
        name="google-calendar-callback",
    ),
    path(
        "google-calendar/",
        GoogleCalendarStatusEndpoint.as_view(),
        name="google-calendar-status",
    ),
    path(
        "workspaces/<str:slug>/initiatives/",
        InitiativeViewSet.as_view({"get": "list", "post": "create"}),
        name="initiatives",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/",
        InitiativeViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="initiatives",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/projects/",
        InitiativeViewSet.as_view({"post": "link_project"}),
        name="initiative-projects",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/projects/<uuid:project_id>/",
        InitiativeViewSet.as_view({"delete": "unlink_project"}),
        name="initiative-projects",
    ),
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
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/can-edit/",
        PageCanEditEndpoint.as_view(),
        name="page-can-edit",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/wiki-access/",
        WikiAccessEndpoint.as_view(),
        name="wiki-access",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/wiki-access/folders/<uuid:folder_id>/",
        WikiFolderAccessEndpoint.as_view(),
        name="wiki-folder-access",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/trash/",
        ProjectTrashEndpoint.as_view(),
        name="project-trash",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/trash/<str:trash_type>/<uuid:pk>/",
        ProjectTrashEndpoint.as_view(),
        name="project-trash-item",
    ),
]
