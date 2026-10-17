from django.contrib import admin
from .models import OutboxEvent

@admin.register(OutboxEvent)
class OutboxEventAdmin(admin.ModelAdmin):
    list_display = ['id', 'event_type', 'aggregate_id', 'status', 'retry_count', 'max_retries', 'created_at', 'processed_at']
    list_filter = ['status', 'event_type', 'aggregate_type']
    search_fields = ['event_type', 'aggregate_id']
    readonly_fields = ['id', 'event_type', 'aggregate_type', 'aggregate_id', 'payload', 'created_at', 'processed_at']
    list_per_page = 30
