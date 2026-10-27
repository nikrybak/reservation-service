import { type Selectable, sql } from 'kysely';
import { ConcurrencyConflictError } from '../../../shared/application/errors';
import { bigIntToNumber, type BookingsTable } from '../../../shared/persistence/postgres/database';
import {
  isUniqueViolation,
  type KyselyDatabase,
} from '../../../shared/persistence/postgres/kysely-database';
import type { BookingRepository } from '../application/ports';
import type { Booking } from '../domain/booking';
import { fromBookingRecord, toBookingRecord } from './booking-record.mapper';

const INITIAL_VERSION = 1;

export class KyselyBookingRepository implements BookingRepository {
  constructor(private readonly database: KyselyDatabase) {}

  async insert(booking: Booking): Promise<void> {
    const record = toBookingRecord(booking);
    try {
      await this.database.executor
        .insertInto('bookings')
        .values({
          id: record.id,
          hold_id: record.holdId,
          event_id: record.ticketedEventId,
          holder_id: record.holderId,
          idempotency_key: record.idempotencyKey,
          seats: JSON.stringify(record.seats),
          total_minor: record.totalMinor,
          currency: record.currency,
          status: record.status,
          created_at: record.createdAt,
          cancelled_at: record.cancelledAt,
          version: INITIAL_VERSION,
        })
        .execute();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConcurrencyConflictError('booking', record.holdId);
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Booking | null> {
    const row = await this.database.executor
      .selectFrom('bookings')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? fromColumns(row) : null;
  }

  async findByIdempotencyKey(holderId: string, key: string): Promise<Booking | null> {
    const row = await this.database.executor
      .selectFrom('bookings')
      .selectAll()
      .where('holder_id', '=', holderId)
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
    return row ? fromColumns(row) : null;
  }

  async save(booking: Booking): Promise<void> {
    const record = toBookingRecord(booking);
    const result = await this.database.executor
      .updateTable('bookings')
      .set({
        status: record.status,
        cancelled_at: record.cancelledAt,
        version: sql<number>`version + 1`,
      })
      .where('id', '=', record.id)
      .where('version', '=', booking.version)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new ConcurrencyConflictError('booking', record.id);
    }
  }
}

function fromColumns(row: Selectable<BookingsTable>): Booking {
  return fromBookingRecord({
    id: row.id,
    holdId: row.hold_id,
    ticketedEventId: row.event_id,
    holderId: row.holder_id,
    idempotencyKey: row.idempotency_key,
    seats: row.seats,
    totalMinor: bigIntToNumber(row.total_minor),
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    version: row.version,
  });
}
