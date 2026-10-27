import { type Selectable, sql } from 'kysely';
import { ConcurrencyConflictError } from '../../../shared/application/errors';
import { bigIntToNumber, type HoldsTable } from '../../../shared/persistence/postgres/database';
import type { KyselyDatabase } from '../../../shared/persistence/postgres/kysely-database';
import type { HoldRepository } from '../application/ports';
import type { Hold } from '../domain/hold';
import { fromHoldRecord, toJsonSeats } from './hold-record.mapper';

const INITIAL_VERSION = 1;

export class KyselyHoldRepository implements HoldRepository {
  constructor(private readonly database: KyselyDatabase) {}

  async insert(hold: Hold): Promise<void> {
    const state = hold.snapshot();
    await this.database.executor
      .insertInto('holds')
      .values({
        id: state.id,
        event_id: state.ticketedEventId,
        holder_id: state.holderId,
        seats: JSON.stringify(toJsonSeats(state.seats)),
        total_minor: state.total.amountMinor,
        currency: state.total.currency,
        status: state.status,
        created_at: state.createdAt,
        expires_at: state.expiresAt,
        version: INITIAL_VERSION,
      })
      .execute();
  }

  async findById(id: string): Promise<Hold | null> {
    const row = await this.database.executor
      .selectFrom('holds')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? fromColumns(row) : null;
  }

  async save(hold: Hold): Promise<void> {
    const result = await this.database.executor
      .updateTable('holds')
      .set({ status: hold.status, version: sql<number>`version + 1` })
      .where('id', '=', hold.id)
      .where('version', '=', hold.version)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new ConcurrencyConflictError('hold', hold.id);
    }
  }

  async findExpiredActiveIds(now: Date, limit: number): Promise<string[]> {
    const rows = await this.database.executor
      .selectFrom('holds')
      .select('id')
      .where('status', '=', 'active')
      .where('expires_at', '<=', now)
      .orderBy('expires_at')
      .limit(limit)
      .execute();
    return rows.map((row) => row.id);
  }
}

function fromColumns(row: Selectable<HoldsTable>): Hold {
  return fromHoldRecord({
    id: row.id,
    ticketedEventId: row.event_id,
    holderId: row.holder_id,
    seats: row.seats,
    totalMinor: bigIntToNumber(row.total_minor),
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    version: row.version,
  });
}
