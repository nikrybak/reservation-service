import type {
  OutboxFailure,
  OutboxMessage,
  OutboxRepository,
} from '../../application/outbox.repository';
import type { DomainEvent, DomainEventName } from '../../domain/domain-event';
import type { InMemoryStore, InMemoryTable } from '../../persistence/in-memory/in-memory-store';

export interface OutboxRecord {
  seq: number;
  id: string;
  name: DomainEventName;
  aggregateId: string;
  ticketedEventId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil: Date | null;
  publishedAt: Date | null;
  deadAt: Date | null;
  lastError: string | null;
  version: number;
}

export class InMemoryOutboxRepository implements OutboxRepository {
  private readonly table: InMemoryTable<OutboxRecord>;
  private sequence = 0;

  constructor(store: InMemoryStore) {
    this.table = store.table<OutboxRecord>('outbox');
  }

  append(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      this.sequence += 1;
      this.table.insert(event.id, {
        seq: this.sequence,
        id: event.id,
        name: event.name,
        aggregateId: event.aggregateId,
        ticketedEventId: event.ticketedEventId,
        payload: { ...event.payload },
        occurredAt: event.occurredAt,
        attempts: 0,
        nextAttemptAt: event.occurredAt,
        lockedUntil: null,
        publishedAt: null,
        deadAt: null,
        lastError: null,
      });
    }
    return Promise.resolve();
  }

  claimDue(now: Date, limit: number, leaseUntil: Date): Promise<OutboxMessage[]> {
    const due = this.table
      .all()
      .filter(
        (row) =>
          row.publishedAt === null &&
          row.deadAt === null &&
          row.nextAttemptAt <= now &&
          (row.lockedUntil === null || row.lockedUntil <= now),
      )
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);

    for (const row of due) {
      this.table.update(row.id, { ...row, lockedUntil: leaseUntil }, row.version);
    }
    return Promise.resolve(due.map(toMessage));
  }

  markPublished(id: string, publishedAt: Date): Promise<void> {
    this.patch(id, { publishedAt, lockedUntil: null });
    return Promise.resolve();
  }

  markFailed(id: string, failure: OutboxFailure): Promise<void> {
    this.patch(id, {
      attempts: failure.attempts,
      lastError: failure.error,
      nextAttemptAt: failure.nextAttemptAt,
      deadAt: failure.dead ? failure.nextAttemptAt : null,
      lockedUntil: null,
    });
    return Promise.resolve();
  }

  /** Test and diagnostics helper; not part of the port. */
  records(): OutboxRecord[] {
    return this.table.all().sort((a, b) => a.seq - b.seq);
  }

  private patch(id: string, changes: Partial<Omit<OutboxRecord, 'version'>>): void {
    const row = this.table.get(id);
    if (row) {
      this.table.update(id, { ...row, ...changes }, row.version);
    }
  }
}

function toMessage(row: OutboxRecord): OutboxMessage {
  return {
    id: row.id,
    name: row.name,
    aggregateId: row.aggregateId,
    ticketedEventId: row.ticketedEventId,
    occurredAt: row.occurredAt,
    payload: row.payload,
    attempts: row.attempts,
  };
}
