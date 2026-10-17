from rest_framework import views, permissions, status
from rest_framework.response import Response
from .models import OutboxEvent
from .services import OutboxProcessor

class OutboxEventListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        events = OutboxEvent.objects.order_by('-created_at')[:50]
        data = [
            {
                'id': str(e.id),
                'event_type': e.event_type,
                'aggregate_id': e.aggregate_id,
                'status': e.status,
                'retry_count': e.retry_count,
                'max_retries': e.max_retries,
                'last_error': e.last_error,
                'created_at': e.created_at,
                'processed_at': e.processed_at,
                'payload': e.payload,
            }
            for e in events
        ]
        return Response(data)

class OutboxProcessBatchView(views.APIView):
    """
    Manually triggers outbox event processing batch.
    Allows reviewers and frontend users to watch asynchronous tasks move from PENDING -> PROCESSED.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        batch_size = int(request.data.get('batch_size', 20))
        result = OutboxProcessor.process_pending_events(batch_size=batch_size)
        return Response(result, status=status.HTTP_200_OK)
