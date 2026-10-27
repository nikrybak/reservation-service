import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { OutboxMessage } from '../../application/outbox.repository';
import { type EventSubscriber, EventSubscribers } from '../application/event-subscribers';

/** Stand-in for a message broker publisher: emits each event as a structured log line. */
@Injectable()
export class LoggingEventSubscriber implements EventSubscriber, OnModuleInit {
  readonly name = 'log-publisher';
  readonly events = 'all';

  constructor(
    private readonly subscribers: EventSubscribers,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LoggingEventSubscriber.name);
  }

  onModuleInit(): void {
    this.subscribers.register(this);
  }

  handle(message: OutboxMessage): Promise<void> {
    this.logger.info(
      {
        event: message.name,
        eventId: message.id,
        aggregateId: message.aggregateId,
        ticketedEventId: message.ticketedEventId,
        occurredAt: message.occurredAt.toISOString(),
        payload: message.payload,
      },
      'domain event published',
    );
    return Promise.resolve();
  }
}
