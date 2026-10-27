import type { ColumnType, Generated } from 'kysely';

/** pg returns BIGINT as a string to avoid precision loss; repositories convert at the edge. */
type BigIntColumn = ColumnType<string, number, number>;
type JsonColumn<T> = ColumnType<T, string, string>;

export interface JsonPricingTier {
  code: string;
  name: string;
  priceMinor: number;
}

export interface JsonSection {
  name: string;
  rows: Array<{ name: string; tierCode: string; seatCount: number }>;
}

export interface JsonHeldSeat {
  seatId: string;
  tierCode: string;
  priceMinor: number;
}

export interface TicketedEventsTable {
  id: string;
  name: string;
  venue: string;
  starts_at: Date;
  currency: string;
  pricing_tiers: JsonColumn<JsonPricingTier[]>;
  layout: JsonColumn<JsonSection[]>;
  created_at: Date;
}

export interface SeatsTable {
  event_id: string;
  seat_id: string;
  tier_code: string;
  status: 'available' | 'held' | 'booked';
  hold_id: string | null;
  held_until: Date | null;
  booking_id: string | null;
  version: number;
}

export interface HoldsTable {
  id: string;
  event_id: string;
  holder_id: string;
  seats: JsonColumn<JsonHeldSeat[]>;
  total_minor: BigIntColumn;
  currency: string;
  status: 'active' | 'confirmed' | 'released' | 'expired';
  created_at: Date;
  expires_at: Date;
  version: number;
}

export interface BookingsTable {
  id: string;
  hold_id: string;
  event_id: string;
  holder_id: string;
  idempotency_key: string;
  seats: JsonColumn<JsonHeldSeat[]>;
  total_minor: BigIntColumn;
  currency: string;
  status: 'confirmed' | 'cancelled';
  created_at: Date;
  cancelled_at: Date | null;
  version: number;
}

export interface OutboxTable {
  seq: Generated<string>;
  id: string;
  name: string;
  aggregate_id: string;
  ticketed_event_id: string;
  payload: JsonColumn<Record<string, unknown>>;
  occurred_at: Date;
  attempts: Generated<number>;
  next_attempt_at: Date;
  locked_until: Date | null;
  published_at: Date | null;
  dead_at: Date | null;
  last_error: string | null;
}

export interface Database {
  ticketed_events: TicketedEventsTable;
  seats: SeatsTable;
  holds: HoldsTable;
  bookings: BookingsTable;
  outbox: OutboxTable;
}

export function bigIntToNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`BIGINT value ${value} exceeds the safe integer range`);
  }
  return parsed;
}
