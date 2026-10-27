import type { Seat } from '../domain/seat';
import type { SeatId } from '../domain/seat-id';
import type { TicketedEvent } from '../domain/ticketed-event';

export const TICKETED_EVENT_REPOSITORY = Symbol('TICKETED_EVENT_REPOSITORY');
export const SEAT_REPOSITORY = Symbol('SEAT_REPOSITORY');

export interface TicketedEventRepository {
  insert(event: TicketedEvent): Promise<void>;
  findById(id: string): Promise<TicketedEvent | null>;
}

export interface SeatRepository {
  insertMany(seats: readonly Seat[]): Promise<void>;
  findByEvent(ticketedEventId: string): Promise<Seat[]>;
  findByIds(ticketedEventId: string, seatIds: readonly SeatId[]): Promise<Seat[]>;
  /** Persists changed seats; throws ConcurrencyConflictError if any seat's version is stale. */
  saveAll(seats: readonly Seat[]): Promise<void>;
}
