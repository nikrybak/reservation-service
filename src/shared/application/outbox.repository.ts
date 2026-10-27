import type { DomainEvent, DomainEventName, DomainEventPayload } from '../domain/domain-event';

export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');

export interface OutboxMessage {
  readonly id: string;
  readonly name: DomainEventName;
  readonly aggregateId: string;
  readonly ticketedEventId: string;
  readonly occurredAt: Date;
  readonly payload: DomainEventPayload;
  readonly attempts: number;
}

export interface OutboxFailure {
  readonly attempts: number;
  readonly error: string;
  readonly nextAttemptAt: Date;
  readonly dead: boolean;
}

export interface OutboxRepository {
  /** Must run inside the transaction that produced the events. */
  append(events: readonly DomainEvent[]): Promise<void>;
  /** Leases due messages so concurrent dispatchers never deliver the same batch. */
  claimDue(now: Date, limit: number, leaseUntil: Date): Promise<OutboxMessage[]>;
  markPublished(id: string, publishedAt: Date): Promise<void>;
  markFailed(id: string, failure: OutboxFailure): Promise<void>;
}
