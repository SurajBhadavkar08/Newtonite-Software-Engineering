import functools
import hashlib
import json
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction
from .models import IdempotencyRecord, IdempotencyStatus

def get_idempotency_key(request):
    return request.headers.get('X-Idempotency-Key') or request.headers.get('Idempotency-Key')

def compute_request_hash(data):
    if not data:
        return ""
    try:
        serialized = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode('utf-8')).hexdigest()
    except Exception:
        return ""

def idempotent_action(view_func):
    """
    Decorator for DRF viewset action or APIView method to enforce idempotency.
    If 'X-Idempotency-Key' is provided:
      - If existing completed record: returns cached response immediately.
      - If in-flight record: returns 409 Conflict.
      - Otherwise: records pending state, executes action, stores completed response.
    """
    @functools.wraps(view_func)
    def wrapper(view_instance, request, *args, **kwargs):
        key = get_idempotency_key(request)
        if not key or not request.user or not request.user.is_authenticated:
            # If no idempotency key provided or unauthenticated, execute normally
            return view_func(view_instance, request, *args, **kwargs)

        req_hash = compute_request_hash(request.data)
        endpoint = request.path

        # Check existing record
        record = IdempotencyRecord.objects.filter(key=key, user=request.user).first()
        if record:
            if record.status == IdempotencyStatus.COMPLETED:
                return Response(
                    record.response_body,
                    status=record.response_status or status.HTTP_200_OK,
                    headers={'X-Cache-Lookup': 'HIT', 'X-Idempotency-Status': 'CACHED'}
                )
            elif record.status == IdempotencyStatus.PENDING:
                return Response(
                    {
                        'error': True,
                        'message': 'A request with this idempotency key is currently being processed.',
                        'code': 'idempotency_conflict',
                    },
                    status=status.HTTP_409_CONFLICT
                )

        # Create pending record atomically
        try:
            with transaction.atomic():
                record, created = IdempotencyRecord.objects.get_or_create(
                    key=key,
                    user=request.user,
                    defaults={
                        'endpoint': endpoint,
                        'request_hash': req_hash,
                        'status': IdempotencyStatus.PENDING,
                    }
                )
                if not created and record.status == IdempotencyStatus.COMPLETED:
                    return Response(
                        record.response_body,
                        status=record.response_status or status.HTTP_200_OK,
                        headers={'X-Cache-Lookup': 'HIT'}
                    )
        except Exception:
            # Race condition on key insertion
            return Response(
                {
                    'error': True,
                    'message': 'Duplicate concurrent request detected for this idempotency key.',
                    'code': 'idempotency_conflict',
                },
                status=status.HTTP_409_CONFLICT
            )

        try:
            response = view_func(view_instance, request, *args, **kwargs)
            # Store completed response
            if response.status_code < 500:
                record.status = IdempotencyStatus.COMPLETED
                record.response_status = response.status_code
                record.response_body = response.data
                record.save(update_fields=['status', 'response_status', 'response_body', 'updated_at'])
            else:
                record.status = IdempotencyStatus.FAILED
                record.save(update_fields=['status', 'updated_at'])
            return response
        except Exception as exc:
            record.status = IdempotencyStatus.FAILED
            record.save(update_fields=['status', 'updated_at'])
            raise exc

    return wrapper
