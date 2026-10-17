from django.db import OperationalError
from rest_framework.views import exception_handler
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework import status

class ConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'A conflict occurred while processing your request.'
    default_code = 'conflict'

    def __init__(self, detail=None, code=None, current_version=None, current_state=None):
        super().__init__(detail, code)
        self.current_version = current_version
        self.current_state = current_state

def custom_exception_handler(exc, context):
    # Convert SQLite/Postgres lock contention into a client-recoverable conflict
    # instead of an opaque 500 during concurrent writes.
    if isinstance(exc, OperationalError):
        return Response(
            {
                'error': True,
                'status_code': status.HTTP_409_CONFLICT,
                'code': 'database_contention',
                'message': (
                    'Conflict: the database was busy handling a concurrent update. '
                    'Please refresh the latest state and retry.'
                ),
            },
            status=status.HTTP_409_CONFLICT,
        )

    response = exception_handler(exc, context)

    if response is not None:
        custom_data = {
            'error': True,
            'status_code': response.status_code,
            'message': str(exc.detail) if hasattr(exc, 'detail') else str(exc),
        }
        if hasattr(exc, 'get_codes'):
            custom_data['code'] = exc.get_codes()
        if hasattr(exc, 'current_version') and exc.current_version is not None:
            custom_data['current_version'] = exc.current_version
        if hasattr(exc, 'current_state') and exc.current_state is not None:
            custom_data['current_state'] = exc.current_state

        response.data = custom_data

    return response
