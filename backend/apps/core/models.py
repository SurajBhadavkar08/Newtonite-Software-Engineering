from django.db import models
from django.contrib.auth.models import User

class Team(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Items belonging to sensitive teams (e.g., Compliance, Payments) require strict membership to view."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class TeamRole(models.TextChoices):
    MEMBER = 'MEMBER', 'Team Member'
    LEAD = 'LEAD', 'Team Lead'
    ADMIN = 'ADMIN', 'Team Admin'
    OBSERVER = 'OBSERVER', 'Observer'

class TeamMembership(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memberships')
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=20, choices=TeamRole.choices, default=TeamRole.MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'team')

    def __str__(self):
        return f"{self.user.username} in {self.team.name} ({self.role})"
