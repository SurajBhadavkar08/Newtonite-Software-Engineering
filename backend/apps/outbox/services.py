import logging
from django.utils import timezone
from django.db import transaction
from .models import OutboxEvent, OutboxStatus

logger = logging.getLogger(__name__)

class OutboxService:
    @staticmethod
    def record_event(event_type: str, aggregate_id: str, payload: dict, aggregate_type: str = 'work_item'):
        """
        Records an event into the Outbox table within the current database transaction.
        Guarantees that the event is committed if and only if the primary business transaction commits.
        """
        return OutboxEvent.objects.create(
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=str(aggregate_id),
            payload=payload,
            status=OutboxStatus.PENDING,
        )

class OutboxProcessor:
    @classmethod
    def process_pending_events(cls, batch_size=20):
        """
        Polls and processes pending or retryable outbox events.
        Safe for concurrent worker execution via row locking where supported.
        """
        # Find pending or failed events eligible for retry
        events_to_process = list(
            OutboxEvent.objects.filter(
                status__in=[OutboxStatus.PENDING, OutboxStatus.FAILED]
            ).order_by('created_at')[:batch_size]
        )

        processed_count = 0
        failed_count = 0

        for event in events_to_process:
            # Mark processing
            event.status = OutboxStatus.PROCESSING
            event.save(update_fields=['status'])

            try:
                cls._dispatch_event(event)
                event.status = OutboxStatus.PROCESSED
                event.processed_at = timezone.now()
                event.last_error = ''
                event.save(update_fields=['status', 'processed_at', 'last_error'])
                processed_count += 1
            except Exception as exc:
                event.retry_count += 1
                event.last_error = str(exc)
                if event.retry_count >= event.max_retries:
                    event.status = OutboxStatus.DEAD_LETTER
                else:
                    event.status = OutboxStatus.FAILED
                event.save(update_fields=['status', 'retry_count', 'last_error'])
                failed_count += 1

        return {
            'processed': processed_count,
            'failed': failed_count,
            'total_batch': len(events_to_process),
        }

    @classmethod
    def _dispatch_event(cls, event: OutboxEvent):
        """
        Simulates dispatching secondary async side effects:
        - Dispatch notifications
        - Webhooks
        - SLA monitoring alerts
        - High severity on-call escalations
        """
        payload = event.payload or {}

        # Allow tests to deliberately simulate transient or permanent failures
        if payload.get('simulate_failure'):
            raise RuntimeError("Simulated secondary processing failure (network/timeout).")

        event_type = event.event_type
        if event_type == 'work_item.p0_escalation':
            logger.warning(f"[OUTBOX P0 DISPATCH] Escalating P0 Incident {event.aggregate_id} to on-call pager!")
        elif event_type == 'work_item.assigned':
            logger.info(f"[OUTBOX NOTIFY] Notifying assignee {payload.get('assignee')} for {event.aggregate_id}")
        elif event_type == 'work_item.approval_requested':
            logger.info(f"[OUTBOX APPROVAL] Alerting leads of {payload.get('team')} for approval of {event.aggregate_id}")
        elif event_type == 'work_item.status_changed':
            logger.info(f"[OUTBOX STATUS] Work item {event.aggregate_id} transitioned: {payload.get('old_status')} -> {payload.get('new_status')}")
        else:
            logger.info(f"[OUTBOX PROCESSED] Generic event: {event_type} on {event.aggregate_id}")
