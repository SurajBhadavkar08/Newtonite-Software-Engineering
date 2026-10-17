from django.contrib import admin
from .models import WorkItem, WorkItemActivity, WorkItemComment, ApprovalRequest

class WorkItemActivityInline(admin.TabularInline):
    model = WorkItemActivity
    extra = 0
    readonly_fields = ['actor', 'action', 'field_name', 'old_value', 'new_value', 'notes', 'created_at']
    can_delete = False

class ApprovalRequestInline(admin.TabularInline):
    model = ApprovalRequest
    extra = 0
    readonly_fields = ['requested_by', 'status', 'decision_by', 'decision_notes', 'decided_at', 'created_at']
    can_delete = False

@admin.register(WorkItem)
class WorkItemAdmin(admin.ModelAdmin):
    list_display = ['tracking_number', 'title', 'category', 'priority', 'status', 'assigned_team', 'assigned_to', 'version', 'created_at']
    list_filter = ['status', 'priority', 'category', 'assigned_team', 'requires_approval']
    search_fields = ['tracking_number', 'title', 'description']
    readonly_fields = ['tracking_number', 'version', 'created_at', 'updated_at']
    list_per_page = 25
    inlines = [WorkItemActivityInline, ApprovalRequestInline]

@admin.register(WorkItemActivity)
class WorkItemActivityAdmin(admin.ModelAdmin):
    list_display = ['work_item', 'actor', 'action', 'field_name', 'created_at']
    list_filter = ['action']
    search_fields = ['work_item__tracking_number', 'actor__username']
    readonly_fields = ['work_item', 'actor', 'action', 'field_name', 'old_value', 'new_value', 'notes', 'created_at']

@admin.register(WorkItemComment)
class WorkItemCommentAdmin(admin.ModelAdmin):
    list_display = ['work_item', 'author', 'content', 'created_at']
    search_fields = ['work_item__tracking_number', 'author__username']

@admin.register(ApprovalRequest)
class ApprovalRequestAdmin(admin.ModelAdmin):
    list_display = ['work_item', 'requested_by', 'status', 'decision_by', 'decided_at', 'created_at']
    list_filter = ['status']
    search_fields = ['work_item__tracking_number']
    readonly_fields = ['created_at']
