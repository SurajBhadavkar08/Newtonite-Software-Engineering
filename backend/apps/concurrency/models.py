from django.db import models
from django.contrib.auth.models import User

class IdempotencyStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending Processing'
    COMPLETED = 'COMPLETED', 'Completed'
    FAILED = 'FAILED', 'Failed'

class IdempotencyRecord(models.Model):
    key = models.CharField(max_length=128, db_index=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='idempotency_records')
    endpoint = models.CharField(max_length=255)
    request_hash = models.CharField(max_length=64, blank=True)
    status = models.CharField(
        max_length=20,
        choices=IdempotencyStatus.choices,
        default=IdempotencyStatus.PENDING
    )
    response_status = models.IntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('key', 'user')
        indexes = [
            models.Index(fields=['key', 'user']),
        ]

    def __str__(self):
        return f"{self.key} - {self.user.username} ({self.status})"
