import pytest
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from apps.core.models import Team, TeamMembership, TeamRole
from apps.work_items.models import WorkItem, WorkStatus, ApprovalRequest, ApprovalStatus

@pytest.mark.django_db
class TestResourceAuthorization:
    @pytest.fixture(autouse=True)
    def setup(self):
        # Sensitive team: Payments & Fraud
        self.payments_team = Team.objects.create(name="Payments & Fraud", slug="payments-fraud", is_sensitive=True)
        # Non-sensitive team: Support
        self.support_team = Team.objects.create(name="Support", slug="support", is_sensitive=False)

        self.payments_lead = User.objects.create_user(username="sarah_payments", password="password")
        self.support_agent = User.objects.create_user(username="alex_support", password="password")

        TeamMembership.objects.create(user=self.payments_lead, team=self.payments_team, role=TeamRole.LEAD)
        TeamMembership.objects.create(user=self.support_agent, team=self.support_team, role=TeamRole.MEMBER)

        self.client_support = APIClient()
        self.client_support.force_authenticate(user=self.support_agent)

        self.client_payments = APIClient()
        self.client_payments.force_authenticate(user=self.payments_lead)

    def test_non_team_member_cannot_access_sensitive_work_item(self):
        """
        Resource-level authorization: Alex from Support must not be able to view or edit
        sensitive Payments/Fraud items.
        """
        sensitive_item = WorkItem.objects.create(
            title="Suspicious Wire Transfer Investigation",
            description="Details of flagged money laundering account",
            category="PAYMENT_INVESTIGATION",
            assigned_team=self.payments_team,
            created_by=self.payments_lead,
            status=WorkStatus.IN_INVESTIGATION,
            version=1
        )

        # Alex requests list - sensitive item must be filtered out
        list_resp = self.client_support.get("/api/work-items/")
        assert list_resp.status_code == 200
        item_ids = [i["id"] for i in list_resp.data["results"]]
        assert sensitive_item.id not in item_ids

        # Alex attempts direct access by ID - must be rejected
        detail_resp = self.client_support.get(f"/api/work-items/{sensitive_item.id}/")
        assert detail_resp.status_code in [403, 404]

        # Sarah (authorized payments lead) can access it
        sarah_resp = self.client_payments.get(f"/api/work-items/{sensitive_item.id}/")
        assert sarah_resp.status_code == 200
        assert sarah_resp.data["id"] == sensitive_item.id

    def test_regular_team_member_cannot_approve(self):
        """
        Regular MEMBER role is forbidden from granting approvals; only LEAD or ADMIN can approve.
        """
        regular_member = User.objects.create_user(username="payments_member", password="password")
        TeamMembership.objects.create(user=regular_member, team=self.payments_team, role=TeamRole.MEMBER)

        client_member = APIClient()
        client_member.force_authenticate(user=regular_member)

        item = WorkItem.objects.create(
            title="Flagged Payment",
            description="Details",
            category="PAYMENT_INVESTIGATION",
            assigned_team=self.payments_team,
            created_by=self.payments_lead,
            status=WorkStatus.PENDING_APPROVAL,
            requires_approval=True,
            version=1
        )

        approval = ApprovalRequest.objects.create(
            work_item=item,
            requested_by=self.payments_lead,
            status=ApprovalStatus.PENDING
        )

        # Regular member attempts approval
        resp = client_member.post(
            f"/api/work-items/{item.id}/decide-approval/",
            {"approved": True, "notes": "I approve this"},
            format="json"
        )
        assert resp.status_code == 403
