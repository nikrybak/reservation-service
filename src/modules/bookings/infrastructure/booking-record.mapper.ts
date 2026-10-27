import { Money } from '../../../shared/domain/money';
import type { JsonHeldSeat } from '../../../shared/persistence/postgres/database';
import { fromJsonSeats, toJsonSeats } from '../../holds/infrastructure/hold-record.mapper';
import { Booking, type BookingStatus } from '../domain/booking';

export interface BookingRecord {
  id: string;
  holdId: string;
  ticketedEventId: string;
  holderId: string;
  idempotencyKey: string;
  seats: JsonHeldSeat[];
  totalMinor: number;
  currency: string;
  status: BookingStatus;
  createdAt: Date;
  cancelledAt: Date | null;
  version: number;
}

export function toBookingRecord(booking: Booking): Omit<BookingRecord, 'version'> {
  const state = booking.snapshot();
  return {
    id: state.id,
    holdId: state.holdId,
    ticketedEventId: state.ticketedEventId,
    holderId: state.holderId,
    idempotencyKey: state.idempotencyKey,
    seats: toJsonSeats(state.seats),
    totalMinor: state.total.amountMinor,
    currency: state.total.currency,
    status: state.status,
    createdAt: state.createdAt,
    cancelledAt: state.cancelledAt,
  };
}

export function fromBookingRecord(record: BookingRecord): Booking {
  return Booking.restore({
    ...record,
    seats: fromJsonSeats(record.seats, record.currency),
    total: Money.of(record.totalMinor, record.currency),
  });
}
