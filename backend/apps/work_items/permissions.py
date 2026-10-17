from rest_framework import permissions
from apps.core.models import TeamRole, TeamMembership

class IsTeamMemberOrAdmin(permissions.BasePermission):
    """
    Resource-level permission ensuring users can only interact with work items
    they are authorized for.
    Sensitive categories/teams (Compliance, Payments) require active team membership.
    """

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser or user.is_staff:
            return True

        # Check if item or team is sensitive
        is_sensitive = False
        if obj.assigned_team and obj.assigned_team.is_sensitive:
            is_sensitive = True
        if obj.category in ['PAYMENT_INVESTIGATION', 'COMPLIANCE_REQUEST']:
            is_sensitive = True

        is_member = False
        if obj.assigned_team:
            is_member = TeamMembership.objects.filter(user=user, team=obj.assigned_team).exists()

        # If sensitive, ONLY assigned team members can view or edit
        if is_sensitive:
            if not is_member:
                return False

        # Safe read-only methods (GET, HEAD, OPTIONS) for non-sensitive items are visible to all employees
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write actions (PATCH, PUT, DELETE) require being a team member, creator, or current assignee
        if is_member or obj.assigned_to == user or obj.created_by == user:
            return True

        return False

class CanApproveWorkItem(permissions.BasePermission):
    """
    Only Team Leads or Team Admins of the assigned team can grant or deny approvals.
    """

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser or user.is_staff:
            return True

        team = obj.assigned_team if hasattr(obj, 'assigned_team') else getattr(obj, 'work_item', None).assigned_team
        if not team:
            return False

        membership = TeamMembership.objects.filter(user=user, team=team).first()
        if not membership:
            return False

        return membership.role in [TeamRole.LEAD, TeamRole.ADMIN]
