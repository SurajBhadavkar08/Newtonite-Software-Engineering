import pytest
import uuid
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from apps.core.models import Team, TeamMembership, TeamRole
from apps.work_items.models import WorkItem

@pytest.mark.django_db
class TestIdempotency:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.user = User.objects.create_user(username="alex_support", password="password")
        self.team = Team.objects.create(name="Customer Support", slug="customer-support")
        TeamMembership.objects.create(user=self.user, team=self.team, role=TeamRole.MEMBER)

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_idempotent_work_item_creation_prevents_duplicate_records(self):
        """
        Critical Situation: A user repeating an action (e.g. double clicking or retrying after timeout).
        System must ensure identical Idempotency-Key yields identical cached response
        without executing business logic twice.
        """
        idempotency_key = f"req-{uuid.uuid4()}"
        payload = {
            "title": "VIP Customer Account Unlock Request",
            "description": "Customer locked out after 5 invalid attempts",
            "assigned_team": self.team.id,
            "priority": "P1_HIGH",
            "category": "CUSTOMER_ISSUE"
        }

        # First Request
        resp_1 = self.client.post(
            "/api/work-items/",
            payload,
            format="json",
            HTTP_X_IDEMPOTENCY_KEY=idempotency_key
        )
        assert resp_1.status_code == 201
        created_id = resp_1.data["id"]
        assert WorkItem.objects.filter(title="VIP Customer Account Unlock Request").count() == 1

        # Second Request (Identical Key - e.g. retry or double-click)
        resp_2 = self.client.post(
            "/api/work-items/",
            payload,
            format="json",
            HTTP_X_IDEMPOTENCY_KEY=idempotency_key
        )

        assert resp_2.status_code == 201
        assert resp_2.data["id"] == created_id
        assert resp_2.headers.get("X-Cache-Lookup") == "HIT"

        # Crucial: Only one row must exist in the database!
        assert WorkItem.objects.filter(title="VIP Customer Account Unlock Request").count() == 1

    def test_idempotent_transition_does_not_repeat_activities(self):
        """
        Submitting the same transition twice with the same idempotency key
        must not produce duplicate audit logs.
        """
        item = WorkItem.objects.create(
            title="Fix SSL",
            description="Details",
            assigned_team=self.team,
            created_by=self.user,
            status="TRIAGE",
            version=1
        )

        idempotency_key = f"trans-{uuid.uuid4()}"

        # Transition 1
        resp_1 = self.client.post(
            f"/api/work-items/{item.id}/transition/",
            {"target_status": "IN_INVESTIGATION", "notes": "Starting investigation"},
            format="json",
            HTTP_X_IDEMPOTENCY_KEY=idempotency_key
        )
        assert resp_1.status_code == 200

        # Transition 2 with same idempotency key
        resp_2 = self.client.post(
            f"/api/work-items/{item.id}/transition/",
            {"target_status": "IN_INVESTIGATION", "notes": "Starting investigation"},
            format="json",
            HTTP_X_IDEMPOTENCY_KEY=idempotency_key
        )
        assert resp_2.status_code == 200
        assert resp_2.headers.get("X-Cache-Lookup") == "HIT"

        # Check activity count
        activities = item.activities.filter(action="STATUS_CHANGED")
        assert activities.count() == 1
