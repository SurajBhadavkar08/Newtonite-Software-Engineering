from rest_framework.exceptions import ValidationError, PermissionDenied
from django.utils import timezone
from .models import WorkItem, WorkStatus, ApprovalStatus, ApprovalRequest, WorkItemActivity
from apps.core.models import TeamRole, TeamMembership
from apps.outbox.services import OutboxService

class WorkflowEngine:
    """
    Finite State Machine governing operational WorkItem lifecycle,
    transition rules, required approvals, and guard conditions.
    """

    ALLOWED_TRANSITIONS = {
        WorkStatus.TRIAGE: [
            WorkStatus.IN_INVESTIGATION,
            WorkStatus.BLOCKED,
            WorkStatus.CLOSED,
        ],
        WorkStatus.IN_INVESTIGATION: [
            WorkStatus.PENDING_APPROVAL,
            WorkStatus.IN_PROGRESS,
            WorkStatus.BLOCKED,
            WorkStatus.RESOLVED,
        ],
        WorkStatus.PENDING_APPROVAL: [
            WorkStatus.IN_PROGRESS,       # Only with valid approval
            WorkStatus.IN_INVESTIGATION,  # If rejected or rework needed
            WorkStatus.BLOCKED,
        ],
        WorkStatus.IN_PROGRESS: [
            WorkStatus.RESOLVED,
            WorkStatus.BLOCKED,
            WorkStatus.PENDING_APPROVAL,  # If scope change requires new approval
        ],
        WorkStatus.BLOCKED: [
            WorkStatus.TRIAGE,
            WorkStatus.IN_INVESTIGATION,
            WorkStatus.IN_PROGRESS,
        ],
        WorkStatus.RESOLVED: [
            WorkStatus.CLOSED,
            WorkStatus.IN_INVESTIGATION,  # Reopened
        ],
        WorkStatus.CLOSED: [
            WorkStatus.IN_INVESTIGATION,  # Reopened
        ]
    }

    @classmethod
    def can_transition(cls, work_item: WorkItem, target_status: str, user=None):
        current_status = work_item.status
        allowed = cls.ALLOWED_TRANSITIONS.get(current_status, [])
        if target_status not in allowed:
            return False, f"Illegal state transition from '{current_status}' to '{target_status}'."

        # Guard: Requires Approval before In Progress
        if target_status == WorkStatus.IN_PROGRESS and work_item.requires_approval:
            has_approval = work_item.approval_requests.filter(status=ApprovalStatus.APPROVED).exists()
            if not has_approval:
                return False, "This work item requires managerial approval before it can enter 'In Progress'."

        return True, ""

    @classmethod
    def apply_transition(cls, work_item: WorkItem, target_status: str, user, notes="", blocked_reason="", resolution_notes=""):
        can, reason = cls.can_transition(work_item, target_status, user)
        if not can:
            raise ValidationError({'status': reason})

        # Guard: Blocked requires reason
        if target_status == WorkStatus.BLOCKED:
            if not blocked_reason and not work_item.blocked_reason:
                raise ValidationError({'blocked_reason': 'A reason is required when placing an item in Blocked state.'})
            work_item.blocked_reason = blocked_reason or work_item.blocked_reason

        # Clear blocked reason when unblocking
        if work_item.status == WorkStatus.BLOCKED and target_status != WorkStatus.BLOCKED:
            work_item.blocked_reason = ''

        # Guard: Resolved requires resolution notes
        if target_status == WorkStatus.RESOLVED:
            if not resolution_notes and not work_item.resolution_notes:
                raise ValidationError({'resolution_notes': 'Resolution notes are required when resolving a work item.'})
            work_item.resolution_notes = resolution_notes or work_item.resolution_notes

        old_status = work_item.status
        work_item.status = target_status
        work_item.save(update_fields=['status', 'blocked_reason', 'resolution_notes', 'updated_at'])

        # Record activity
        WorkItemActivity.objects.create(
            work_item=work_item,
            actor=user,
            action='STATUS_CHANGED',
            field_name='status',
            old_value=old_status,
            new_value=target_status,
            notes=notes or f"Transitioned from {old_status} to {target_status}"
        )

        # Publish outbox event
        OutboxService.record_event(
            event_type='work_item.status_changed',
            aggregate_id=work_item.tracking_number,
            payload={
                'work_item_id': work_item.id,
                'tracking_number': work_item.tracking_number,
                'old_status': old_status,
                'new_status': target_status,
                'actor': user.username if user else 'system',
                'timestamp': timezone.now().isoformat(),
            }
        )

        return work_item

    @classmethod
    def process_approval(cls, approval_request: ApprovalRequest, reviewer, approved: bool, notes=""):
        work_item = approval_request.work_item
        team = work_item.assigned_team

        # Authorization check: reviewer must be LEAD or ADMIN in team, or superuser
        is_authorized = reviewer.is_superuser or reviewer.is_staff
        if not is_authorized and team:
            membership = TeamMembership.objects.filter(user=reviewer, team=team).first()
            if membership and membership.role in [TeamRole.LEAD, TeamRole.ADMIN]:
                is_authorized = True

        if not is_authorized:
            raise PermissionDenied(
                f"Only Team Leads or Admins of '{team.name if team else 'the team'}' can approve or reject this request."
            )

        new_status = ApprovalStatus.APPROVED if approved else ApprovalStatus.REJECTED
        approval_request.status = new_status
        approval_request.decision_by = reviewer
        approval_request.decision_notes = notes
        approval_request.decided_at = timezone.now()
        approval_request.save()

        # Record activity
        WorkItemActivity.objects.create(
            work_item=work_item,
            actor=reviewer,
            action='APPROVED' if approved else 'REJECTED',
            field_name='approval',
            old_value='PENDING',
            new_value=new_status,
            notes=notes or f"Approval {new_status.lower()} by {reviewer.username}"
        )

        # Publish outbox event
        OutboxService.record_event(
            event_type='work_item.approval_decided',
            aggregate_id=work_item.tracking_number,
            payload={
                'work_item_id': work_item.id,
                'approval_id': approval_request.id,
                'status': new_status,
                'reviewer': reviewer.username,
                'notes': notes,
            }
        )

        # If approved and was in PENDING_APPROVAL, advance to IN_PROGRESS automatically or allow manual advance
        if approved and work_item.status == WorkStatus.PENDING_APPROVAL:
            cls.apply_transition(work_item, WorkStatus.IN_PROGRESS, reviewer, notes="Automatically progressed upon approval.")

        return approval_request
