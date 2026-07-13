# Copyright (c) 2023-present Plane Software, Inc. and contributors
# Kustomisasi Paradise Task Tracker — pembuat work item berulang (B.E.R)
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone

# Third party imports
from celery import shared_task

# Module imports
from plane.utils.exception_logger import log_exception


@shared_task
def create_recurring_issues():
    """Jalan tiap 15 menit via celery beat: buat issue dari jadwal recurring yang jatuh tempo."""
    from plane.db.models import Issue, IssueAssignee, RecurringIssue

    now = timezone.now()
    due = RecurringIssue.objects.filter(is_active=True, next_run_at__lte=now).select_related(
        "template", "project"
    )

    created = 0
    for rec in due:
        try:
            template = rec.template
            issue = Issue.objects.create(
                project=rec.project,
                name=template.title,
                description_html=template.description_html or "<p></p>",
                priority=template.priority or "none",
                created_by=template.created_by,
            )
            if template.default_assignee_id:
                IssueAssignee.objects.create(
                    issue=issue,
                    assignee_id=template.default_assignee_id,
                    project=rec.project,
                    workspace=rec.workspace,
                )
            rec.advance_schedule()
            created += 1
        except Exception as e:
            log_exception(e)
            # Jadwal bermasalah jangan memblokir jadwal lain; coba lagi run berikutnya
            continue

    return created
