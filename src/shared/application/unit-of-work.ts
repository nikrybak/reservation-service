import { Inject, Injectable } from '@nestjs/common';
import type { DomainEvent } from '../domain/domain-event';
import { CommittedEventsBus } from './committed-events.bus';
import { OUTBOX_REPOSITORY, type OutboxRepository } from './outbox.repository';
import { TRANSACTION_MANAGER, type TransactionManager } from './transaction-manager';

export type RecordEvents = (events: readonly DomainEvent[]) => void;

/**
 * Wraps a use case in a transaction and writes the domain events it records to the outbox
 * in that same transaction, so state changes and their events are never out of sync.
 */
@Injectable()
export class UnitOfWork {
  constructor(
    @Inject(TRANSACTION_MANAGER) private readonly transactions: TransactionManager,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    private readonly committedEvents: CommittedEventsBus,
  ) {}

  async execute<T>(work: (recordEvents: RecordEvents) => Promise<T>): Promise<T> {
    const recorded: DomainEvent[] = [];
    const result = await this.transactions.run(async () => {
      const value = await work((events) => recorded.push(...events));
      if (recorded.length > 0) {
        await this.outbox.append(recorded);
      }
      return value;
    });
    this.committedEvents.publish(recorded);
    return result;
  }
}
