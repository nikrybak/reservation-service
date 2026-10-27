import type { Booking } from '../domain/booking';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');

export interface BookingRepository {
  /** Throws ConcurrencyConflictError when the hold or the idempotency key is already used. */
  insert(booking: Booking): Promise<void>;
  findById(id: string): Promise<Booking | null>;
  findByIdempotencyKey(holderId: string, key: string): Promise<Booking | null>;
  save(booking: Booking): Promise<void>;
}
