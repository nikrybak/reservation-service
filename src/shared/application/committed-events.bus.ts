import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../domain/domain-event';

export type CommittedEventsListener = (events: readonly DomainEvent[]) => void;

/**
 * In-process notification that a transaction committed. It is a fast path for local
 * side effects such as cache invalidation; durable delivery is the outbox's job.
 */
@Injectable()
export class CommittedEventsBus {
  private readonly logger = new Logger(CommittedEventsBus.name);
  private readonly listeners: CommittedEventsListener[] = [];

  subscribe(listener: CommittedEventsListener): void {
    this.listeners.push(listener);
  }

  publish(events: readonly DomainEvent[]): void {
    if (events.length === 0) {
      return;
    }
    for (const listener of this.listeners) {
      try {
        listener(events);
      } catch (error) {
        this.logger.error({ err: error }, 'Committed-events listener failed');
      }
    }
  }
}
