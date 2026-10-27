import { Money } from '../../../shared/domain/money';
import type { JsonHeldSeat } from '../../../shared/persistence/postgres/database';
import { type HeldSeat, Hold, type HoldStatus } from '../domain/hold';

export function toJsonSeats(seats: readonly HeldSeat[]): JsonHeldSeat[] {
  return seats.map((seat) => ({
    seatId: seat.seatId,
    tierCode: seat.tierCode,
    priceMinor: seat.price.amountMinor,
  }));
}

export function fromJsonSeats(seats: readonly JsonHeldSeat[], currency: string): HeldSeat[] {
  return seats.map((seat) => ({
    seatId: seat.seatId,
    tierCode: seat.tierCode,
    price: Money.of(seat.priceMinor, currency),
  }));
}

export interface HoldRecord {
  id: string;
  ticketedEventId: string;
  holderId: string;
  seats: JsonHeldSeat[];
  totalMinor: number;
  currency: string;
  status: HoldStatus;
  createdAt: Date;
  expiresAt: Date;
  version: number;
}

export function toHoldRecord(hold: Hold): Omit<HoldRecord, 'version'> {
  const state = hold.snapshot();
  return {
    id: state.id,
    ticketedEventId: state.ticketedEventId,
    holderId: state.holderId,
    seats: toJsonSeats(state.seats),
    totalMinor: state.total.amountMinor,
    currency: state.total.currency,
    status: state.status,
    createdAt: state.createdAt,
    expiresAt: state.expiresAt,
  };
}

export function fromHoldRecord(row: HoldRecord): Hold {
  return Hold.restore({
    id: row.id,
    ticketedEventId: row.ticketedEventId,
    holderId: row.holderId,
    seats: fromJsonSeats(row.seats, row.currency),
    total: Money.of(row.totalMinor, row.currency),
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    version: row.version,
  });
}
