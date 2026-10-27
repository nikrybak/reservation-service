import { Injectable } from '@nestjs/common';
import type { DomainEventName } from '../../domain/domain-event';
import type { OutboxMessage } from '../../application/outbox.repository';

/**
 * Delivery is at least once: a message is retried as a whole when any subscriber fails,
 * so every subscriber must tolerate duplicates.
 */
export interface EventSubscriber {
  readonly name: string;
  readonly events: readonly DomainEventName[] | 'all';
  handle(message: OutboxMessage): Promise<void>;
}

@Injectable()
export class EventSubscribers {
  private readonly subscribers: EventSubscriber[] = [];

  register(subscriber: EventSubscriber): void {
    this.subscribers.push(subscriber);
  }

  async deliver(message: OutboxMessage): Promise<void> {
    for (const subscriber of this.subscribers) {
      if (subscriber.events === 'all' || subscriber.events.includes(message.name)) {
        await subscriber.handle(message);
      }
    }
  }
}
