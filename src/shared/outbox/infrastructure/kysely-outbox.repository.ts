import type { Selectable } from 'kysely';
import type {
  OutboxFailure,
  OutboxMessage,
  OutboxRepository,
} from '../../application/outbox.repository';
import type { DomainEvent, DomainEventName } from '../../domain/domain-event';
import type { OutboxTable } from '../../persistence/postgres/database';
import type { KyselyDatabase } from '../../persistence/postgres/kysely-database';

export class KyselyOutboxRepository implements OutboxRepository {
  constructor(private readonly database: KyselyDatabase) {}

  async append(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.database.executor
      .insertInto('outbox')
      .values(
        events.map((event) => ({
          id: event.id,
          name: event.name,
          aggregate_id: event.aggregateId,
          ticketed_event_id: event.ticketedEventId,
          payload: JSON.stringify(event.payload),
          occurred_at: event.occurredAt,
          next_attempt_at: event.occurredAt,
        })),
      )
      .execute();
  }

  /**
   * SKIP LOCKED lets several dispatcher instances claim disjoint batches, and the lease
   * column hands a batch back automatically if its dispatcher dies mid-delivery.
   */
  async claimDue(now: Date, limit: number, leaseUntil: Date): Promise<OutboxMessage[]> {
    const rows = await this.database.executor
      .updateTable('outbox')
      .set({ locked_until: leaseUntil })
      .where('id', 'in', (eb) =>
        eb
          .selectFrom('outbox')
          .select('id')
          .where('published_at', 'is', null)
          .where('dead_at', 'is', null)
          .where('next_attempt_at', '<=', now)
          .where((inner) =>
            inner.or([inner('locked_until', 'is', null), inner('locked_until', '<=', now)]),
          )
          .orderBy('seq')
          .limit(limit)
          .forUpdate()
          .skipLocked(),
      )
      .returningAll()
      .execute();
    return rows.sort((a, b) => Number(BigInt(a.seq) - BigInt(b.seq))).map(toMessage);
  }

  async markPublished(id: string, publishedAt: Date): Promise<void> {
    await this.database.executor
      .updateTable('outbox')
      .set({ published_at: publishedAt, locked_until: null })
      .where('id', '=', id)
      .execute();
  }

  async markFailed(id: string, failure: OutboxFailure): Promise<void> {
    await this.database.executor
      .updateTable('outbox')
      .set({
        attempts: failure.attempts,
        last_error: failure.error,
        next_attempt_at: failure.nextAttemptAt,
        dead_at: failure.dead ? failure.nextAttemptAt : null,
        locked_until: null,
      })
      .where('id', '=', id)
      .execute();
  }
}

function toMessage(row: Selectable<OutboxTable>): OutboxMessage {
  return {
    id: row.id,
    name: row.name as DomainEventName,
    aggregateId: row.aggregate_id,
    ticketedEventId: row.ticketed_event_id,
    occurredAt: row.occurred_at,
    payload: row.payload,
    attempts: row.attempts,
  };
}
