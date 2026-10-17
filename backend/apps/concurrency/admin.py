from django.contrib import admin
from .models import IdempotencyRecord

@admin.register(IdempotencyRecord)
class IdempotencyRecordAdmin(admin.ModelAdmin):
    list_display = ['key', 'user', 'endpoint', 'status', 'response_status', 'created_at', 'updated_at']
    list_filter = ['status']
    search_fields = ['key', 'user__username', 'endpoint']
    readonly_fields = ['key', 'user', 'endpoint', 'request_hash', 'response_body', 'created_at', 'updated_at']
