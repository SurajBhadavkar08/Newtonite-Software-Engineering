from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from apps.work_items.views import WorkItemViewSet
from apps.core.views import TeamViewSet, PersonaListView, CurrentUserView
from apps.outbox.views import OutboxEventListView, OutboxProcessBatchView

router = DefaultRouter()
router.register(r'work-items', WorkItemViewSet, basename='workitem')
router.register(r'teams', TeamViewSet, basename='team')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api/personas/', PersonaListView.as_view(), name='persona-list'),
    path('api/me/', CurrentUserView.as_view(), name='current-user'),
    path('api/outbox/events/', OutboxEventListView.as_view(), name='outbox-events'),
    path('api/outbox/process/', OutboxProcessBatchView.as_view(), name='outbox-process'),
]
