import pytest
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from apps.core.models import Team, TeamMembership, TeamRole
from apps.work_items.models import WorkItem, WorkStatus, WorkPriority

@pytest.mark.django_db
class TestConcurrencyBehaviors:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.team = Team.objects.create(name="Engineering", slug="engineering", is_sensitive=False)
        self.user_a = User.objects.create_user(username="engineer_a", password="password")
        self.user_b = User.objects.create_user(username="engineer_b", password="password")

        TeamMembership.objects.create(user=self.user_a, team=self.team, role=TeamRole.MEMBER)
        TeamMembership.objects.create(user=self.user_b, team=self.team, role=TeamRole.MEMBER)

        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)

        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)

    def test_optimistic_locking_prevents_stale_update(self):
        """
        Critical Situation: Stale Information Overwrite
        User A and User B both view WorkItem at version 1.
        User A updates priority to P0_CRITICAL (version advances to 2).
        User B attempts to update title with stale version 1.
        System must reject User B's update with 409 Conflict.
        """
        item = WorkItem.objects.create(
            title="Database Connection Pool Exhaustion",
            description="Investigate pool size",
            assigned_team=self.team,
            created_by=self.user_a,
            version=1,
            priority=WorkPriority.P2_MEDIUM,
            status=WorkStatus.IN_INVESTIGATION
        )

        # User A updates priority from version 1
        resp_a = self.client_a.patch(
            f"/api/work-items/{item.id}/",
            {"priority": WorkPriority.P0_CRITICAL, "version": 1},
            format="json"
        )
        assert resp_a.status_code == 200
        assert resp_a.data["priority"] == WorkPriority.P0_CRITICAL
        assert resp_a.data["version"] == 2

        # User B now attempts to update title using stale version 1
        resp_b = self.client_b.patch(
            f"/api/work-items/{item.id}/",
            {"title": "Updated Title By User B", "version": 1},
            format="json"
        )
        assert resp_b.status_code == 409
        assert "conflict" in resp_b.data["message"].lower() or "conflict" in str(resp_b.data.get("code", "")).lower()

        # Verify DB was NOT corrupted by stale write
        item.refresh_from_db()
        assert item.version == 2
        assert item.priority == WorkPriority.P0_CRITICAL
        assert item.title == "Database Connection Pool Exhaustion"

    def test_pessimistic_claim_prevents_double_ownership(self):
        """
        Critical Situation: Two users attempting to take responsibility for the same work.
        Item is unassigned in TRIAGE.
        User A claims item -> succeeds and item is assigned to User A.
        User B attempts to claim item -> rejected with 409 Conflict.
        """
        item = WorkItem.objects.create(
            title="Unassigned Ingress Inconsistency",
            description="Fix ingress routes",
            assigned_team=self.team,
            created_by=self.user_a,
            version=1,
            status=WorkStatus.TRIAGE,
            assigned_to=None
        )

        # User A claims
        resp_a = self.client_a.post(f"/api/work-items/{item.id}/claim/")
        assert resp_a.status_code == 200
        assert resp_a.data["assigned_to"]["username"] == "engineer_a"
        assert resp_a.data["status"] == WorkStatus.IN_INVESTIGATION

        # User B attempts to claim the same item
        resp_b = self.client_b.post(f"/api/work-items/{item.id}/claim/")
        assert resp_b.status_code == 409
        assert resp_b.data["code"] == "already_claimed"
        assert "already claimed by engineer_a" in resp_b.data["message"]

        # Ensure database reflects only User A
        item.refresh_from_db()
        assert item.assigned_to == self.user_a
