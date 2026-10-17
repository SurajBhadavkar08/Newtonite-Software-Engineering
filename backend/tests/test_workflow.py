import pytest
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from apps.core.models import Team, TeamMembership, TeamRole
from apps.work_items.models import WorkItem, WorkStatus, ApprovalStatus

@pytest.mark.django_db
class TestWorkflowStateMachine:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.team = Team.objects.create(name="Operations", slug="operations")
        self.member = User.objects.create_user(username="ops_member", password="password")
        self.lead = User.objects.create_user(username="ops_lead", password="password")

        TeamMembership.objects.create(user=self.member, team=self.team, role=TeamRole.MEMBER)
        TeamMembership.objects.create(user=self.lead, team=self.team, role=TeamRole.LEAD)

        self.client_member = APIClient()
        self.client_member.force_authenticate(user=self.member)

        self.client_lead = APIClient()
        self.client_lead.force_authenticate(user=self.lead)

    def test_illegal_state_transition_is_blocked(self):
        """Cannot skip directly from TRIAGE to RESOLVED."""
        item = WorkItem.objects.create(
            title="Firewall rule review",
            description="Details",
            assigned_team=self.team,
            created_by=self.member,
            status=WorkStatus.TRIAGE,
            version=1
        )

        resp = self.client_member.post(
            f"/api/work-items/{item.id}/transition/",
            {"target_status": WorkStatus.RESOLVED, "resolution_notes": "Done"},
            format="json"
        )
        assert resp.status_code == 400
        assert "illegal state transition" in str(resp.data).lower()

    def test_item_requiring_approval_cannot_advance_without_approval(self):
        """
        Guard condition: If requires_approval is true, advancing to IN_PROGRESS
        is rejected until approved.
        """
        item = WorkItem.objects.create(
            title="High Value Wire Transfer",
            description="Details",
            assigned_team=self.team,
            created_by=self.member,
            status=WorkStatus.IN_INVESTIGATION,
            requires_approval=True,
            version=1
        )

        # Attempt to bypass approval straight to IN_PROGRESS
        resp = self.client_member.post(
            f"/api/work-items/{item.id}/transition/",
            {"target_status": WorkStatus.IN_PROGRESS},
            format="json"
        )
        assert resp.status_code == 400
        assert "requires managerial approval" in str(resp.data).lower()

    def test_lead_approval_advances_work_item(self):
        """
        When Team Lead grants approval, the item advances and activity is recorded.
        """
        item = WorkItem.objects.create(
            title="Emergency Access Grant",
            description="Details",
            assigned_team=self.team,
            created_by=self.member,
            status=WorkStatus.IN_INVESTIGATION,
            requires_approval=True,
            version=1
        )

        # Member requests approval
        req_resp = self.client_member.post(f"/api/work-items/{item.id}/request-approval/", {"notes": "Please sign off"})
        assert req_resp.status_code == 200
        assert req_resp.data["status"] == WorkStatus.PENDING_APPROVAL

        # Lead approves
        decide_resp = self.client_lead.post(
            f"/api/work-items/{item.id}/decide-approval/",
            {"approved": True, "notes": "Approved per change policy"},
            format="json"
        )
        assert decide_resp.status_code == 200
        assert decide_resp.data["status"] == WorkStatus.IN_PROGRESS

        # Verify audit activity
        item.refresh_from_db()
        assert item.status == WorkStatus.IN_PROGRESS
        assert item.activities.filter(action="APPROVED").exists()

    def test_resolving_requires_resolution_notes(self):
        """Guard condition: resolution notes are mandatory."""
        item = WorkItem.objects.create(
            title="DNS change",
            description="Details",
            assigned_team=self.team,
            created_by=self.member,
            status=WorkStatus.IN_PROGRESS,
            version=1
        )

        resp = self.client_member.post(
            f"/api/work-items/{item.id}/transition/",
            {"target_status": WorkStatus.RESOLVED, "resolution_notes": ""},
            format="json"
        )
        assert resp.status_code == 400
        assert "resolution_notes" in str(resp.data)
