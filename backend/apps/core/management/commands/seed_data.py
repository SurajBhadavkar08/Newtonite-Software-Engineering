from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta

from apps.core.models import Team, TeamMembership, TeamRole
from apps.work_items.models import (
    WorkItem, WorkItemActivity, WorkItemComment, ApprovalRequest,
    WorkCategory, WorkPriority, WorkStatus, ApprovalStatus
)

class Command(BaseCommand):
    help = 'Seeds realistic operational data, teams, and personas'

    def handle(self, *args, **options):
        self.stdout.write("Cleaning and seeding Newtonite database...")

        # 1. Create Personas
        users_data = [
            {'username': 'rachel_green', 'email': 'rachel@newtonite.io', 'first_name': 'Rachel', 'last_name': 'Green', 'is_superuser': True, 'is_staff': True},
            {'username': 'david_kim', 'email': 'david@newtonite.io', 'first_name': 'David', 'last_name': 'Kim', 'is_superuser': False, 'is_staff': False},
            {'username': 'sarah_chen', 'email': 'sarah@newtonite.io', 'first_name': 'Sarah', 'last_name': 'Chen', 'is_superuser': False, 'is_staff': False},
            {'username': 'elena_rostova', 'email': 'elena@newtonite.io', 'first_name': 'Elena', 'last_name': 'Rostova', 'is_superuser': False, 'is_staff': False},
            {'username': 'alex_kumar', 'email': 'alex@newtonite.io', 'first_name': 'Alex', 'last_name': 'Kumar', 'is_superuser': False, 'is_staff': False},
            {'username': 'marcus_vance', 'email': 'marcus@newtonite.io', 'first_name': 'Marcus', 'last_name': 'Vance', 'is_superuser': False, 'is_staff': False},
        ]

        users = {}
        for udata in users_data:
            user, created = User.objects.get_or_create(
                username=udata['username'],
                defaults={
                    'email': udata['email'],
                    'first_name': udata['first_name'],
                    'last_name': udata['last_name'],
                    'is_superuser': udata['is_superuser'],
                    'is_staff': udata['is_staff'],
                }
            )
            user.set_password('password123')
            user.save()
            users[udata['username']] = user

        # 2. Create Teams
        teams_data = [
            {'name': 'Engineering', 'slug': 'engineering', 'description': 'Software, infrastructure, and production reliability.', 'is_sensitive': False},
            {'name': 'Payments & Fraud', 'slug': 'payments-fraud', 'description': 'Sensitive transaction monitoring, chargebacks, and fraud investigations.', 'is_sensitive': True},
            {'name': 'Compliance & Legal', 'slug': 'compliance-legal', 'description': 'Regulatory inquiries, audits, and data protection compliance.', 'is_sensitive': True},
            {'name': 'Customer Support', 'slug': 'customer-support', 'description': 'VIP escalations, client disputes, and ticket triage.', 'is_sensitive': False},
            {'name': 'Operations & IT', 'slug': 'operations-it', 'description': 'Internal access governance, procurement, and tooling.', 'is_sensitive': False},
        ]

        teams = {}
        for tdata in teams_data:
            team, _ = Team.objects.get_or_create(
                slug=tdata['slug'],
                defaults=tdata
            )
            teams[tdata['slug']] = team

        # 3. Assign Memberships
        memberships = [
            ('david_kim', 'engineering', TeamRole.LEAD),
            ('marcus_vance', 'engineering', TeamRole.MEMBER),
            ('sarah_chen', 'payments-fraud', TeamRole.LEAD),
            ('alex_kumar', 'customer-support', TeamRole.MEMBER),
            ('elena_rostova', 'compliance-legal', TeamRole.LEAD),
            ('rachel_green', 'operations-it', TeamRole.ADMIN),
            ('rachel_green', 'engineering', TeamRole.OBSERVER),
            ('alex_kumar', 'payments-fraud', TeamRole.OBSERVER),
        ]

        for username, team_slug, role in memberships:
            TeamMembership.objects.get_or_create(
                user=users[username],
                team=teams[team_slug],
                defaults={'role': role}
            )

        # 4. Create Work Items
        if WorkItem.objects.count() == 0:
            # Item 1: P0 Incident
            w1 = WorkItem.objects.create(
                tracking_number='OPS-1001',
                title='Spike in 504 Gateway Timeouts on Checkout API',
                description='Automated telemetry indicates 504 error rate jumped to 8.4% across the checkout microservice cluster. Payment processing requests are backing up in ingress queues.',
                category=WorkCategory.ENGINEERING_INCIDENT,
                priority=WorkPriority.P0_CRITICAL,
                status=WorkStatus.IN_PROGRESS,
                assigned_team=teams['engineering'],
                assigned_to=users['david_kim'],
                created_by=users['david_kim'],
                requires_approval=False,
                version=3,
                tags=['incident', 'checkout', 'p0', 'ingress'],
                due_date=timezone.now() + timedelta(hours=2)
            )
            WorkItemActivity.objects.create(
                work_item=w1, actor=users['david_kim'], action='CREATED', notes='Incident declared from Datadog alert.'
            )
            WorkItemActivity.objects.create(
                work_item=w1, actor=users['david_kim'], action='STATUS_CHANGED', field_name='status', old_value='TRIAGE', new_value='IN_PROGRESS', notes='Incident response mobilized.'
            )
            WorkItemComment.objects.create(
                work_item=w1, author=users['marcus_vance'], content='Redis connection pool saturation identified on replica pods. Provisioning 2 additional read nodes.'
            )

            # Item 2: Sensitive Payment Fraud Alert with Pending Approval
            w2 = WorkItem.objects.create(
                tracking_number='OPS-1002',
                title='Suspicious Outbound Wire Transfer ($128,500) Flagged',
                description='High-risk account 4099-US triggered AML Rule #14: rapid velocity increase after password reset. Transaction pending manual compliance and manager release.',
                category=WorkCategory.PAYMENT_INVESTIGATION,
                priority=WorkPriority.P1_HIGH,
                status=WorkStatus.PENDING_APPROVAL,
                assigned_team=teams['payments-fraud'],
                assigned_to=users['sarah_chen'],
                created_by=users['sarah_chen'],
                requires_approval=True,
                version=2,
                tags=['fraud', 'wire', 'aml', 'high-value'],
                due_date=timezone.now() + timedelta(hours=6)
            )
            WorkItemActivity.objects.create(
                work_item=w2, actor=users['sarah_chen'], action='CREATED', notes='AML alert flagged wire transfer.'
            )
            WorkItemActivity.objects.create(
                work_item=w2, actor=users['sarah_chen'], action='APPROVAL_REQUESTED', notes='Manager sign-off requested before freezing or releasing funds.'
            )
            ApprovalRequest.objects.create(
                work_item=w2,
                requested_by=users['sarah_chen'],
                status=ApprovalStatus.PENDING,
                decision_notes='Account owner verification in progress via call back.'
            )

            # Item 3: GDPR Compliance Request (Sensitive)
            w3 = WorkItem.objects.create(
                tracking_number='OPS-1003',
                title='GDPR Article 17 Erasure Notice: Enterprise Account #8812',
                description='Formal erasure request received from EU Data Protection Representative for user data across data warehouse and transaction archives.',
                category=WorkCategory.COMPLIANCE_REQUEST,
                priority=WorkPriority.P2_MEDIUM,
                status=WorkStatus.IN_INVESTIGATION,
                assigned_team=teams['compliance-legal'],
                assigned_to=users['elena_rostova'],
                created_by=users['elena_rostova'],
                requires_approval=False,
                version=1,
                tags=['gdpr', 'erasure', 'legal', 'eu'],
                due_date=timezone.now() + timedelta(days=5)
            )
            WorkItemActivity.objects.create(
                work_item=w3, actor=users['elena_rostova'], action='CREATED', notes='Legal notice logged.'
            )

            # Item 4: Unassigned P1 Triage (Claim Collision Target)
            w4 = WorkItem.objects.create(
                tracking_number='OPS-1004',
                title='SSL Certificate Expiry in 48 Hours: auth.internal.newtonite.io',
                description='Automated certbot renewal failed due to DNS challenge timeout. Needs manual renewal and rollout to ingress routers before outage.',
                category=WorkCategory.ENGINEERING_INCIDENT,
                priority=WorkPriority.P1_HIGH,
                status=WorkStatus.TRIAGE,
                assigned_team=teams['engineering'],
                assigned_to=None,
                created_by=users['rachel_green'],
                requires_approval=False,
                version=1,
                tags=['ssl', 'security', 'certbot', 'triage']
            )
            WorkItemActivity.objects.create(
                work_item=w4, actor=users['rachel_green'], action='CREATED', notes='Alert logged in triage queue.'
            )

            # Item 5: Customer Billing Dispute with Approval Required
            w5 = WorkItem.objects.create(
                tracking_number='OPS-1005',
                title='VIP Client Double-Billed for Annual Subscription ($24,000)',
                description='Stripe webhook duplicate event caused customer card to be debited twice. Client requested emergency refund. Customer Support policy requires Team Lead approval for refunds over $5,000.',
                category=WorkCategory.CUSTOMER_ISSUE,
                priority=WorkPriority.P1_HIGH,
                status=WorkStatus.PENDING_APPROVAL,
                assigned_team=teams['customer-support'],
                assigned_to=users['alex_kumar'],
                created_by=users['alex_kumar'],
                requires_approval=True,
                version=2,
                tags=['billing', 'refund', 'vip', 'stripe']
            )
            WorkItemActivity.objects.create(
                work_item=w5, actor=users['alex_kumar'], action='APPROVAL_REQUESTED', notes='Refund approval requested from Operations Admin.'
            )
            ApprovalRequest.objects.create(
                work_item=w5,
                requested_by=users['alex_kumar'],
                status=ApprovalStatus.PENDING,
                decision_notes='Duplicate charge ID: ch_3NklmQ9 verified on Stripe dashboard.'
            )

            # Item 6: Blocked Task
            w6 = WorkItem.objects.create(
                tracking_number='OPS-1006',
                title='Stripe Treasury Production API Key Provisioning',
                description='Issuing banking accounts capability blocked awaiting counter-signed enterprise agreement from partner bank.',
                category=WorkCategory.OPERATIONAL_APPROVAL,
                priority=WorkPriority.P2_MEDIUM,
                status=WorkStatus.BLOCKED,
                assigned_team=teams['operations-it'],
                assigned_to=users['rachel_green'],
                created_by=users['rachel_green'],
                blocked_reason='Awaiting counter-signature on Treasury Addendum from Partner Bank legal team.',
                requires_approval=False,
                version=2,
                tags=['banking', 'vendor', 'blocked']
            )
            WorkItemActivity.objects.create(
                work_item=w6, actor=users['rachel_green'], action='BLOCKED', field_name='status', old_value='IN_PROGRESS', new_value='BLOCKED', notes='Blocked on external dependency.'
            )

            # Item 7: Resolved Work Item
            w7 = WorkItem.objects.create(
                tracking_number='OPS-1007',
                title='Failed Webhook Delivery to Core Accounting Ledger',
                description='Nightly reconciliation job failed because accounting ledger API returned 429 Too Many Requests.',
                category=WorkCategory.ENGINEERING_INCIDENT,
                priority=WorkPriority.P2_MEDIUM,
                status=WorkStatus.RESOLVED,
                assigned_team=teams['engineering'],
                assigned_to=users['marcus_vance'],
                created_by=users['david_kim'],
                resolution_notes='Implemented exponential jitter backoff on webhook dispatcher and replayed 1,420 missed events. All balances reconciled.',
                requires_approval=False,
                version=3,
                tags=['webhook', 'accounting', 'reconciliation']
            )
            WorkItemActivity.objects.create(
                work_item=w7, actor=users['marcus_vance'], action='RESOLVED', notes='Resolved with backoff jitter fix.'
            )

        self.stdout.write(self.style.SUCCESS("Successfully seeded database with teams, users, and operational work items."))
