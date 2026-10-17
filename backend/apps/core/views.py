from rest_framework import viewsets, permissions, views, status
from rest_framework.response import Response
from django.contrib.auth.models import User
from .models import Team, TeamMembership
from .serializers import TeamSerializer, PersonaSerializer, UserSummarySerializer

class TeamViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Team.objects.all().prefetch_related('memberships')
    serializer_class = TeamSerializer
    permission_classes = [permissions.IsAuthenticated]

class PersonaListView(views.APIView):
    """
    Returns available system personas with their team roles.
    Enables instant role-switching in the UI for evaluation and testing.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        users = User.objects.all().prefetch_related('memberships__team')
        serializer = PersonaSerializer(users, many=True)
        return Response(serializer.data)

class CurrentUserView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = PersonaSerializer(request.user)
        return Response(serializer.data)
