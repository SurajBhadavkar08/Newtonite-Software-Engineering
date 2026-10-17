from django.db import models
from django.contrib.auth.models import User
from apps.core.models import Team

class WorkCategory(models.TextChoices):
    CUSTOMER_ISSUE = 'CUSTOMER_ISSUE', 'Customer Issue'
    ENGINEERING_INCIDENT = 'ENGINEERING_INCIDENT', 'Engineering Incident'
    PAYMENT_INVESTIGATION = 'PAYMENT_INVESTIGATION', 'Payment Investigation'
    COMPLIANCE_REQUEST = 'COMPLIANCE_REQUEST', 'Compliance Request'
    OPERATIONAL_APPROVAL = 'OPERATIONAL_APPROVAL', 'Operational Task / Approval'
    SECURITY_ALERT = 'SECURITY_ALERT', 'Security Alert'

class WorkPriority(models.TextChoices):
    P0_CRITICAL = 'P0_CRITICAL', 'P0 - Critical'
    P1_HIGH = 'P1_HIGH', 'P1 - High'
    P2_MEDIUM = 'P2_MEDIUM', 'P2 - Medium'
    P3_LOW = 'P3_LOW', 'P3 - Low'

class WorkStatus(models.TextChoices):
    TRIAGE = 'TRIAGE', 'Triage'
    IN_INVESTIGATION = 'IN_INVESTIGATION', 'In Investigation'
    PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending Approval'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    BLOCKED = 'BLOCKED', 'Blocked'
    RESOLVED = 'RESOLVED', 'Resolved'
    CLOSED = 'CLOSED', 'Closed'

class WorkItem(models.Model):
    tracking_number = models.CharField(max_length=30, unique=True, editable=False, db_index=True)
    title = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=40, choices=WorkCategory.choices, default=WorkCategory.CUSTOMER_ISSUE)
    priority = models.CharField(max_length=20, choices=WorkPriority.choices, default=WorkPriority.P2_MEDIUM)
    status = models.CharField(max_length=30, choices=WorkStatus.choices, default=WorkStatus.TRIAGE, db_index=True)

    assigned_team = models.ForeignKey(
        Team,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='work_items'
    )
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_work_items'
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='created_work_items'
    )

    requires_approval = models.BooleanField(default=False)
    # Optimistic Concurrency Control (OCC) version tracking
    version = models.PositiveIntegerField(default=1)

    blocked_reason = models.TextField(blank=True, default='')
    resolution_notes = models.TextField(blank=True, default='')
    tags = models.JSONField(default=list, blank=True)
    due_date = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'priority']),
            models.Index(fields=['assigned_team', 'status']),
            models.Index(fields=['assigned_to', 'status']),
        ]

    def save(self, *args, **kwargs):
        if not self.tracking_number:
            # Generate human-friendly tracking number if new
            last_item = WorkItem.objects.order_by('-id').first()
            next_num = 1001 if not last_item else (last_item.id + 1001)
            self.tracking_number = f"OPS-{next_num}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.tracking_number}: {self.title} [{self.status}]"

class WorkItemActivity(models.Model):
    work_item = models.ForeignKey(WorkItem, on_delete=models.CASCADE, related_name='activities')
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=50)
    field_name = models.CharField(max_length=50, blank=True)
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        actor_name = self.actor.username if self.actor else 'System'
        return f"{actor_name} {self.action} on {self.work_item.tracking_number} at {self.created_at}"

class WorkItemComment(models.Model):
    work_item = models.ForeignKey(WorkItem, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Comment by {self.author.username} on {self.work_item.tracking_number}"

class ApprovalStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending Review'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'

class ApprovalRequest(models.Model):
    work_item = models.ForeignKey(WorkItem, on_delete=models.CASCADE, related_name='approval_requests')
    requested_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='requested_approvals')
    status = models.CharField(max_length=20, choices=ApprovalStatus.choices, default=ApprovalStatus.PENDING)
    decision_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_approvals')
    decision_notes = models.TextField(blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Approval for {self.work_item.tracking_number} ({self.status})"
