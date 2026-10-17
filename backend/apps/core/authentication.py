from rest_framework.authentication import BaseAuthentication
from django.contrib.auth.models import User
from django.utils.deprecation import MiddlewareMixin

class PersonaAuthentication(BaseAuthentication):
    """
    Allows authenticating as a specific user via 'X-Persona-User: <username>' header.
    Essential for multi-persona simulation, role-switching, and concurrent user testing.
    """
    def authenticate(self, request):
        username = request.headers.get('X-Persona-User') or request.META.get('HTTP_X_PERSONA_USER')
        if not username:
            # Fall back to other authentication classes if header not present
            return None

        try:
            user = User.objects.get(username=username)
            return (user, None)
        except User.DoesNotExist:
            return None

class PersonaHeaderMiddleware(MiddlewareMixin):
    """
    Django middleware to attach request.user from X-Persona-User header if present.
    """
    def process_request(self, request):
        username = request.headers.get('X-Persona-User') or request.META.get('HTTP_X_PERSONA_USER')
        if username and (not request.user or not request.user.is_authenticated or request.user.username != username):
            try:
                request.user = User.objects.get(username=username)
            except User.DoesNotExist:
                pass
