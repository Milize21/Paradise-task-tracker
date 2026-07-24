# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker — API baca jejak audit (B.E.R)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.paginator import Paginator

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Auditlog (MIT, jazzband) — lihat NOTICE.md
from auditlog.models import LogEntry

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE

# Model yang dipantau (lihat plane/db/audit.py). Batasi ke ini supaya registrasi
# lain (kalau kelak ditambah) tidak ikut bocor ke endpoint ini.
_TRACKED_MODELS = ["project", "projectmember", "workspacemember", "issue", "page"]

_ACTION_MAP = {
    "create": LogEntry.Action.CREATE,
    "update": LogEntry.Action.UPDATE,
    "delete": LogEntry.Action.DELETE,
}

_DEFAULT_PER_PAGE = 50
_MAX_PER_PAGE = 200


def _serialize(entry):
    actor = entry.actor
    return {
        "id": entry.id,
        "timestamp": entry.timestamp,
        "action": entry.get_action_display(),
        "model": entry.content_type.model if entry.content_type else None,
        "object_repr": entry.object_repr,
        "object_id": entry.object_pk,
        "changes": entry.changes,
        "remote_addr": entry.remote_addr,
        "actor": (
            {
                "id": str(actor.id),
                "email": actor.email,
                "display_name": actor.display_name,
            }
            if actor
            else None
        ),
    }


class AuditLogEndpoint(BaseAPIView):
    """Jejak audit workspace — siapa mengubah apa. Hanya admin workspace.

    Filter query: ?model=page|issue|project|projectmember|workspacemember,
    ?action=create|update|delete, ?actor=<user_id>, ?page=, ?per_page=.

    ponytail: single-workspace — entri tidak difilter per-workspace karena
    deployment ini satu workspace. Kalau kelak multi-workspace, stempel
    workspace_id saat capture (plane/db/audit.py) lalu filter di sini.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        qs = (
            LogEntry.objects.filter(content_type__model__in=_TRACKED_MODELS)
            .select_related("actor", "content_type")
            .order_by("-timestamp")
        )

        model = request.GET.get("model")
        if model:
            qs = qs.filter(content_type__model=model)

        action = request.GET.get("action")
        if action in _ACTION_MAP:
            qs = qs.filter(action=_ACTION_MAP[action])

        actor = request.GET.get("actor")
        if actor:
            qs = qs.filter(actor_id=actor)

        try:
            per_page = min(int(request.GET.get("per_page", _DEFAULT_PER_PAGE)), _MAX_PER_PAGE)
        except ValueError:
            per_page = _DEFAULT_PER_PAGE
        per_page = max(per_page, 1)

        paginator = Paginator(qs, per_page)
        page = paginator.get_page(request.GET.get("page", 1))

        return Response(
            {
                "count": paginator.count,
                "total_pages": paginator.num_pages,
                "page": page.number,
                "results": [_serialize(e) for e in page.object_list],
            },
            status=status.HTTP_200_OK,
        )
