import time
import sys
from django.core.management.base import BaseCommand
from apps.outbox.services import OutboxProcessor

class Command(BaseCommand):
    help = 'Processes pending asynchronous events from the transactional Outbox'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Run one batch and exit')
        parser.add_argument('--batch-size', type=int, default=20, help='Batch size per iteration')
        parser.add_argument('--interval', type=float, default=2.0, help='Polling interval in seconds')

    def handle(self, *args, **options):
        once = options['once']
        batch_size = options['batch_size']
        interval = options['interval']

        self.stdout.write(self.style.SUCCESS('Starting Newtonite Outbox Worker...'))

        while True:
            try:
                result = OutboxProcessor.process_pending_events(batch_size=batch_size)
                if result['total_batch'] > 0:
                    self.stdout.write(
                        self.style.NOTICE(
                            f"Processed {result['processed']}/{result['total_batch']} events "
                            f"({result['failed']} failed/retried)"
                        )
                    )
            except Exception as e:
                self.stderr.write(self.style.ERROR(f"Error processing outbox events: {e}"))

            if once:
                break

            time.sleep(interval)
