import type {
  InMemoryStore,
  InMemoryTable,
} from '../../../shared/persistence/in-memory/in-memory-store';
import type { BookingRepository } from '../application/ports';
import type { Booking } from '../domain/booking';
import { type BookingRecord, fromBookingRecord, toBookingRecord } from './booking-record.mapper';

export class InMemoryBookingRepository implements BookingRepository {
  private readonly table: InMemoryTable<BookingRecord>;

  constructor(store: InMemoryStore) {
    this.table = store.table<BookingRecord>('bookings', [
      (row) => `hold:${row.holdId}`,
      (row) => `key:${row.holderId}:${row.idempotencyKey}`,
    ]);
  }

  insert(booking: Booking): Promise<void> {
    this.table.insert(booking.id, toBookingRecord(booking));
    return Promise.resolve();
  }

  findById(id: string): Promise<Booking | null> {
    const row = this.table.get(id);
    return Promise.resolve(row ? fromBookingRecord(row) : null);
  }

  findByIdempotencyKey(holderId: string, key: string): Promise<Booking | null> {
    const row = this.table
      .all()
      .find((candidate) => candidate.holderId === holderId && candidate.idempotencyKey === key);
    return Promise.resolve(row ? fromBookingRecord(row) : null);
  }

  save(booking: Booking): Promise<void> {
    this.table.update(booking.id, toBookingRecord(booking), booking.version);
    return Promise.resolve();
  }
}
