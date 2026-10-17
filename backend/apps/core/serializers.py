from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Team, TeamMembership

class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email']

class TeamSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(source='memberships.count', read_only=True)

    class Meta:
        model = Team
        fields = ['id', 'name', 'slug', 'description', 'is_sensitive', 'member_count', 'created_at']

class TeamMembershipSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)
    team = TeamSerializer(read_only=True)

    class Meta:
        model = TeamMembership
        fields = ['id', 'user', 'team', 'role', 'joined_at']

class PersonaSerializer(serializers.ModelSerializer):
    teams = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'is_superuser', 'teams']

    def get_teams(self, obj):
        memberships = obj.memberships.select_related('team').all()
        return [
            {
                'team_id': m.team.id,
                'team_name': m.team.name,
                'team_slug': m.team.slug,
                'role': m.role,
                'is_sensitive': m.team.is_sensitive,
            }
            for m in memberships
        ]
