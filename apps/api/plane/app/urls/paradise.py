# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker — URL fitur kustom (B.E.R)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import DivisionDashboardEndpoint, WorkLogExportEndpoint, InitiativeViewSet

urlpatterns = [
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
]
