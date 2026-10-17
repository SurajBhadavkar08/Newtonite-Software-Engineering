from rest_framework import serializers
from .models import WorkItem, WorkItemActivity, WorkItemComment, ApprovalRequest
from apps.core.serializers import UserSummarySerializer, TeamSerializer
from apps.core.models import Team
from django.contrib.auth.models import User

class ApprovalRequestSerializer(serializers.ModelSerializer):
    requested_by = UserSummarySerializer(read_only=True)
    decision_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = ApprovalRequest
        fields = [
            'id', 'work_item', 'requested_by', 'status',
            'decision_by', 'decision_notes', 'decided_at', 'created_at'
        ]
        read_only_fields = ['id', 'status', 'decision_by', 'decided_at', 'created_at']

class WorkItemActivitySerializer(serializers.ModelSerializer):
    actor = UserSummarySerializer(read_only=True)

    class Meta:
        model = WorkItemActivity
        fields = [
            'id', 'work_item', 'actor', 'action', 'field_name',
            'old_value', 'new_value', 'notes', 'created_at'
        ]

class WorkItemCommentSerializer(serializers.ModelSerializer):
    author = UserSummarySerializer(read_only=True)

    class Meta:
        model = WorkItemComment
        fields = ['id', 'work_item', 'author', 'content', 'created_at']
        read_only_fields = ['id', 'author', 'created_at', 'work_item']

class WorkItemListSerializer(serializers.ModelSerializer):
    assigned_team_name = serializers.CharField(source='assigned_team.name', read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.username', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    has_pending_approval = serializers.SerializerMethodField()

    class Meta:
        model = WorkItem
        fields = [
            'id', 'tracking_number', 'title', 'category', 'priority', 'status',
            'assigned_team', 'assigned_team_name', 'assigned_to', 'assigned_to_name',
            'created_by', 'created_by_name', 'requires_approval', 'has_pending_approval',
            'version', 'due_date', 'created_at', 'updated_at'
        ]

    def get_has_pending_approval(self, obj):
        return obj.approval_requests.filter(status='PENDING').exists()

class WorkItemDetailSerializer(serializers.ModelSerializer):
    assigned_team = TeamSerializer(read_only=True)
    assigned_team_id = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(), source='assigned_team', write_only=True, required=False, allow_null=True
    )
    assigned_to = UserSummarySerializer(read_only=True)
    assigned_to_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='assigned_to', write_only=True, required=False, allow_null=True
    )
    created_by = UserSummarySerializer(read_only=True)
    activities = WorkItemActivitySerializer(many=True, read_only=True)
    comments = WorkItemCommentSerializer(many=True, read_only=True)
    approval_requests = ApprovalRequestSerializer(many=True, read_only=True)

    class Meta:
        model = WorkItem
        fields = [
            'id', 'tracking_number', 'title', 'description', 'category', 'priority', 'status',
            'assigned_team', 'assigned_team_id', 'assigned_to', 'assigned_to_id',
            'created_by', 'requires_approval', 'version',
            'blocked_reason', 'resolution_notes', 'tags', 'due_date',
            'activities', 'comments', 'approval_requests',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'tracking_number', 'created_by', 'created_at', 'updated_at']

class WorkItemCreateUpdateSerializer(serializers.ModelSerializer):
    version = serializers.IntegerField(required=False)

    class Meta:
        model = WorkItem
        fields = [
            'id', 'title', 'description', 'category', 'priority', 'status',
            'assigned_team', 'assigned_to', 'requires_approval', 'version',
            'blocked_reason', 'resolution_notes', 'tags', 'due_date'
        ]
        read_only_fields = ['id']
