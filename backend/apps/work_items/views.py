import time

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import OperationalError, transaction
from django.db.models import Q, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import (
    WorkItem, WorkItemActivity, WorkItemComment, ApprovalRequest,
    WorkStatus, WorkPriority, ApprovalStatus
)
from .serializers import (
    WorkItemListSerializer, WorkItemDetailSerializer, WorkItemCreateUpdateSerializer,
    WorkItemCommentSerializer, ApprovalRequestSerializer
)
from .permissions import IsTeamMemberOrAdmin, CanApproveWorkItem
from .state_machine import WorkflowEngine
from apps.core.exceptions import ConflictError
from apps.core.models import TeamRole, TeamMembership
from apps.concurrency.idempotency import idempotent_action
from apps.outbox.services import OutboxService

class WorkItemViewSet(viewsets.ModelViewSet):
    queryset = WorkItem.objects.all().select_related('assigned_team', 'assigned_to', 'created_by')
    permission_classes = [IsAuthenticated, IsTeamMemberOrAdmin]

    def get_serializer_class(self):
        if self.action == 'list':
            return WorkItemListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return WorkItemCreateUpdateSerializer
        return WorkItemDetailSerializer

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()

        # Enforce resource-level visibility for sensitive teams / categories
        if not (user.is_superuser or user.is_staff):
            user_teams = TeamMembership.objects.filter(user=user).values_list('team_id', flat=True)
            # Users can see non-sensitive items, OR sensitive items where they belong to the assigned team
            qs = qs.filter(
                Q(assigned_team__is_sensitive=False, category__in=['CUSTOMER_ISSUE', 'ENGINEERING_INCIDENT', 'OPERATIONAL_APPROVAL', 'SECURITY_ALERT']) |
                Q(assigned_team_id__in=user_teams)
            )

        # Filters
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        priority_filter = self.request.query_params.get('priority')
        if priority_filter:
            qs = qs.filter(priority=priority_filter)

        category_filter = self.request.query_params.get('category')
        if category_filter:
            qs = qs.filter(category=category_filter)

        team_filter = self.request.query_params.get('assigned_team')
        if team_filter:
            qs = qs.filter(assigned_team_id=team_filter)

        assignee_filter = self.request.query_params.get('assigned_to')
        if assignee_filter:
            if assignee_filter == 'unassigned':
                qs = qs.filter(assigned_to__isnull=True)
            elif assignee_filter == 'me':
                qs = qs.filter(assigned_to=user)
            else:
                qs = qs.filter(assigned_to_id=assignee_filter)

        # Scope filters
        scope = self.request.query_params.get('scope')
        if scope == 'my_items':
            qs = qs.filter(assigned_to=user)
        elif scope == 'my_teams':
            user_teams = TeamMembership.objects.filter(user=user).values_list('team_id', flat=True)
            qs = qs.filter(assigned_team_id__in=user_teams)
        elif scope == 'needs_attention':
            # Needs attention: Pending approval, or unassigned P0/P1, or blocked
            qs = qs.filter(
                Q(status=WorkStatus.PENDING_APPROVAL) |
                Q(status=WorkStatus.BLOCKED) |
                Q(assigned_to__isnull=True, priority__in=[WorkPriority.P0_CRITICAL, WorkPriority.P1_HIGH])
            )
        elif scope == 'pending_approval':
            qs = qs.filter(status=WorkStatus.PENDING_APPROVAL)
        elif scope == 'critical_incidents':
            qs = qs.filter(priority__in=[WorkPriority.P0_CRITICAL, WorkPriority.P1_HIGH], status__in=[
                WorkStatus.TRIAGE, WorkStatus.IN_INVESTIGATION, WorkStatus.IN_PROGRESS
            ])

        # Search query
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(tracking_number__icontains=search)
            )

        return qs

    @idempotent_action
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            work_item = serializer.save(created_by=request.user, version=1)

            # Record creation activity
            WorkItemActivity.objects.create(
                work_item=work_item,
                actor=request.user,
                action='CREATED',
                notes=f"Work item created by {request.user.username}"
            )

            # If P0 Critical, emit escalation outbox event
            if work_item.priority == WorkPriority.P0_CRITICAL:
                OutboxService.record_event(
                    event_type='work_item.p0_escalation',
                    aggregate_id=work_item.tracking_number,
                    payload={
                        'work_item_id': work_item.id,
                        'title': work_item.title,
                        'creator': request.user.username,
                        'priority': work_item.priority,
                    }
                )

            # Record generic creation outbox event
            OutboxService.record_event(
                event_type='work_item.created',
                aggregate_id=work_item.tracking_number,
                payload={
                    'work_item_id': work_item.id,
                    'title': work_item.title,
                    'category': work_item.category,
                }
            )

        detail_serializer = WorkItemDetailSerializer(work_item)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)

    @idempotent_action
    def update(self, request, *args, **kwargs):
        return self._handle_update(request, partial=False)

    @idempotent_action
    def partial_update(self, request, *args, **kwargs):
        return self._handle_update(request, partial=True)

    def _handle_update(self, request, partial=False):
        """
        Implements Optimistic Concurrency Control (OCC).
        Detects if another user modified the record between read and update.
        """
        instance = self.get_object()
        expected_version = request.data.get('version')
        if expected_version is None:
            # Check If-Match header fallback
            if_match = request.headers.get('If-Match')
            if if_match and if_match.isdigit():
                expected_version = int(if_match)

        with transaction.atomic():
            # Refresh lock for checking version
            locked_instance = WorkItem.objects.select_for_update().get(id=instance.id)

            if expected_version is not None and locked_instance.version != int(expected_version):
                # Stale data conflict!
                current_data = WorkItemDetailSerializer(locked_instance).data
                raise ConflictError(
                    detail=f"Update conflict: This work item has been modified by another user (Server version: {locked_instance.version}, Your version: {expected_version}). Please refresh the latest state.",
                    current_version=locked_instance.version,
                    current_state=current_data
                )

            serializer = self.get_serializer(locked_instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            serializer.validated_data.pop('version', None)

            # Bump version atomically
            new_version = locked_instance.version + 1
            updated_item = serializer.save()
            updated_item.version = new_version
            updated_item.save(update_fields=['version'])

            # Record activity for modified fields
            changed_fields = list(serializer.validated_data.keys())
            if 'version' in changed_fields:
                changed_fields.remove('version')

            WorkItemActivity.objects.create(
                work_item=updated_item,
                actor=request.user,
                action='UPDATED',
                notes=f"Updated fields: {', '.join(changed_fields)}"
            )

        detail_serializer = WorkItemDetailSerializer(updated_item)
        return Response(detail_serializer.data)

    def _already_claimed_response(self, item):
        assignee = item.assigned_to.username if item.assigned_to else 'another user'
        return Response(
            {
                'error': True,
                'code': 'already_claimed',
                'message': f"Conflict: Work item {item.tracking_number} was already claimed by {assignee}.",
                'current_assignee': assignee if item.assigned_to else None,
            },
            status=status.HTTP_409_CONFLICT,
        )

    @action(detail=True, methods=['post'], url_path='claim')
    @idempotent_action
    def claim_item(self, request, pk=None):
        """
        Demonstrates Pessimistic Concurrency / Race Condition Prevention.
        Uses select_for_update() row locking to prevent two workers from claiming
        the exact same item simultaneously.

        SQLite can raise OperationalError under true parallel writes; we retry and,
        if another user won the race, return a clean 409 instead of a 500.
        """
        max_attempts = 8
        for attempt in range(max_attempts):
            try:
                with transaction.atomic():
                    item = WorkItem.objects.select_for_update().select_related('assigned_to').get(id=pk)

                    # Check if someone else already took it
                    if item.assigned_to and item.assigned_to != request.user:
                        return self._already_claimed_response(item)

                    # Idempotent re-claim by the same user
                    if item.assigned_to == request.user:
                        return Response(WorkItemDetailSerializer(item).data)

                    old_assignee = item.assigned_to.username if item.assigned_to else 'None'
                    item.assigned_to = request.user
                    item.version += 1

                    # Auto advance from TRIAGE to IN_INVESTIGATION on first claim
                    status_changed = False
                    if item.status == WorkStatus.TRIAGE:
                        item.status = WorkStatus.IN_INVESTIGATION
                        status_changed = True

                    item.save()

                    WorkItemActivity.objects.create(
                        work_item=item,
                        actor=request.user,
                        action='CLAIMED',
                        field_name='assigned_to',
                        old_value=old_assignee,
                        new_value=request.user.username,
                        notes=f"Claimed by {request.user.username}" + (
                            " (auto-advanced to In Investigation)" if status_changed else ""
                        ),
                    )

                    # Publish outbox event
                    OutboxService.record_event(
                        event_type='work_item.assigned',
                        aggregate_id=item.tracking_number,
                        payload={
                            'work_item_id': item.id,
                            'assignee': request.user.username,
                            'actor': request.user.username,
                        },
                    )

                return Response(WorkItemDetailSerializer(item).data)
            except WorkItem.DoesNotExist:
                return Response(
                    {'error': True, 'code': 'not_found', 'message': 'Work item not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            except OperationalError:
                # Another writer holds the SQLite lock. Back off, then check whether
                # the competing claim already succeeded so the client gets 409 not 500.
                time.sleep(0.04 * (attempt + 1))
                contested = (
                    WorkItem.objects.select_related('assigned_to').filter(id=pk).first()
                )
                if contested and contested.assigned_to and contested.assigned_to != request.user:
                    return self._already_claimed_response(contested)
                continue

        contested = WorkItem.objects.select_related('assigned_to').filter(id=pk).first()
        if contested and contested.assigned_to and contested.assigned_to != request.user:
            return self._already_claimed_response(contested)

        return Response(
            {
                'error': True,
                'code': 'claim_contention',
                'message': (
                    'Conflict: concurrent claim contention prevented acquiring ownership. '
                    'Please refresh and retry.'
                ),
            },
            status=status.HTTP_409_CONFLICT,
        )

    @action(detail=True, methods=['post'], url_path='transition')
    @idempotent_action
    def transition_state(self, request, pk=None):
        """
        Executes a formal state machine transition with guard validations.
        """
        target_status = request.data.get('target_status')
        notes = request.data.get('notes', '')
        blocked_reason = request.data.get('blocked_reason', '')
        resolution_notes = request.data.get('resolution_notes', '')
        expected_version = request.data.get('version')

        with transaction.atomic():
            item = WorkItem.objects.select_for_update().get(id=pk)

            if expected_version is not None and item.version != int(expected_version):
                raise ConflictError(
                    detail=f"Conflict: Item status has changed on the server (Server version: {item.version}).",
                    current_version=item.version,
                    current_state=WorkItemDetailSerializer(item).data
                )

            item = WorkflowEngine.apply_transition(
                work_item=item,
                target_status=target_status,
                user=request.user,
                notes=notes,
                blocked_reason=blocked_reason,
                resolution_notes=resolution_notes,
            )
            item.version += 1
            item.save(update_fields=['version'])

        return Response(WorkItemDetailSerializer(item).data)

    @action(detail=True, methods=['post'], url_path='request-approval')
    @idempotent_action
    def request_approval(self, request, pk=None):
        notes = request.data.get('notes', '')
        with transaction.atomic():
            item = WorkItem.objects.select_for_update().get(id=pk)

            # Check if there is already a pending approval request
            if item.approval_requests.filter(status=ApprovalStatus.PENDING).exists():
                return Response(
                    {'error': True, 'message': 'An approval request is already pending for this item.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            item.requires_approval = True
            item.status = WorkStatus.PENDING_APPROVAL
            item.version += 1
            item.save(update_fields=['requires_approval', 'status', 'version', 'updated_at'])

            approval = ApprovalRequest.objects.create(
                work_item=item,
                requested_by=request.user,
                decision_notes=notes,
            )

            WorkItemActivity.objects.create(
                work_item=item,
                actor=request.user,
                action='APPROVAL_REQUESTED',
                notes=notes or f"Approval requested by {request.user.username}"
            )

            OutboxService.record_event(
                event_type='work_item.approval_requested',
                aggregate_id=item.tracking_number,
                payload={
                    'work_item_id': item.id,
                    'approval_id': approval.id,
                    'requester': request.user.username,
                    'team': item.assigned_team.name if item.assigned_team else 'Unassigned',
                }
            )

        return Response(WorkItemDetailSerializer(item).data)

    @action(detail=True, methods=['post'], url_path='decide-approval', permission_classes=[IsAuthenticated, CanApproveWorkItem])
    @idempotent_action
    def decide_approval(self, request, pk=None):
        approved = request.data.get('approved', False)
        notes = request.data.get('notes', '')

        with transaction.atomic():
            item = WorkItem.objects.select_for_update().get(id=pk)
            self.check_object_permissions(request, item)
            pending_approval = item.approval_requests.filter(status=ApprovalStatus.PENDING).first()
            if not pending_approval:
                return Response(
                    {'error': True, 'message': 'No pending approval found for this work item.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            WorkflowEngine.process_approval(
                approval_request=pending_approval,
                reviewer=request.user,
                approved=approved,
                notes=notes
            )
            item.refresh_from_db()
            item.version += 1
            item.save(update_fields=['version'])

        return Response(WorkItemDetailSerializer(item).data)

    @action(detail=True, methods=['post'], url_path='comments')
    @idempotent_action
    def add_comment(self, request, pk=None):
        item = self.get_object()
        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Comment content cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            comment = WorkItemComment.objects.create(
                work_item=item,
                author=request.user,
                content=content,
            )
            WorkItemActivity.objects.create(
                work_item=item,
                actor=request.user,
                action='COMMENT_ADDED',
                notes=f"Added comment: {content[:60]}..."
            )

        return Response(WorkItemCommentSerializer(comment).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='metrics')
    def get_metrics(self, request):
        """
        Dashboard summary metrics calculated on server side for fast loading.
        """
        qs = self.get_queryset()
        total_active = qs.exclude(status__in=[WorkStatus.CLOSED, WorkStatus.RESOLVED]).count()
        unassigned_triage = qs.filter(status=WorkStatus.TRIAGE, assigned_to__isnull=True).count()
        p0_p1_incidents = qs.filter(
            priority__in=[WorkPriority.P0_CRITICAL, WorkPriority.P1_HIGH]
        ).exclude(status__in=[WorkStatus.CLOSED, WorkStatus.RESOLVED]).count()
        pending_approvals = qs.filter(status=WorkStatus.PENDING_APPROVAL).count()
        blocked_items = qs.filter(status=WorkStatus.BLOCKED).count()
        resolved_today = qs.filter(status=WorkStatus.RESOLVED).count()

        return Response({
            'total_active': total_active,
            'unassigned_triage': unassigned_triage,
            'p0_p1_incidents': p0_p1_incidents,
            'pending_approvals': pending_approvals,
            'blocked_items': blocked_items,
            'resolved_today': resolved_today,
        })
