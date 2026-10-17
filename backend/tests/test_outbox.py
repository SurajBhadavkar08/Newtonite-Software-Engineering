import pytest
from django.contrib.auth.models import User
from apps.core.models import Team
from apps.work_items.models import WorkItem, WorkPriority, WorkStatus
from apps.outbox.models import OutboxEvent, OutboxStatus
from apps.outbox.services import OutboxProcessor, OutboxService

@pytest.mark.django_db
class TestOutboxPattern:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.user = User.objects.create_user(username="test_admin", password="password")
        self.team = Team.objects.create(name="IT", slug="it")

    def test_outbox_event_created_on_state_change(self):
        """
        Emitting secondary processing tasks via Outbox pattern guarantees transactional integrity.
        """
        event = OutboxService.record_event(
            event_type="work_item.status_changed",
            aggregate_id="OPS-9999",
            payload={"old_status": "TRIAGE", "new_status": "IN_PROGRESS"}
        )
        assert event.status == OutboxStatus.PENDING
        assert event.retry_count == 0

        # Run processor batch
        result = OutboxProcessor.process_pending_events()
        assert result["processed"] >= 1

        event.refresh_from_db()
        assert event.status == OutboxStatus.PROCESSED
        assert event.processed_at is not None

    def test_outbox_retry_and_dead_letter_on_repeated_failure(self):
        """
        When asynchronous secondary processing fails, the worker retries up to max_retries
        and then places the event in the DEAD_LETTER queue without blocking the system.
        """
        failing_event = OutboxService.record_event(
            event_type="work_item.p0_escalation",
            aggregate_id="OPS-8888",
            payload={"simulate_failure": True}
        )

        # Retry 1
        OutboxProcessor.process_pending_events()
        failing_event.refresh_from_db()
        assert failing_event.status == OutboxStatus.FAILED
        assert failing_event.retry_count == 1

        # Retry 2
        OutboxProcessor.process_pending_events()
        failing_event.refresh_from_db()
        assert failing_event.status == OutboxStatus.FAILED
        assert failing_event.retry_count == 2

        # Retry 3 -> hits max_retries (3), moves to DEAD_LETTER
        OutboxProcessor.process_pending_events()
        failing_event.refresh_from_db()
        assert failing_event.status == OutboxStatus.DEAD_LETTER
        assert failing_event.retry_count == 3
        assert "Simulated secondary processing failure" in failing_event.last_error
