import type { Money } from '../../../shared/domain/money';
import type { Seat, SeatStatus } from '../domain/seat';
import type { TicketedEvent } from '../domain/ticketed-event';

export interface SeatAvailability {
  readonly seatId: string;
  readonly number: number;
  readonly tierCode: string;
  readonly status: SeatStatus;
}

export interface RowAvailability {
  readonly name: string;
  readonly seats: readonly SeatAvailability[];
}

export interface SectionAvailability {
  readonly name: string;
  readonly rows: readonly RowAvailability[];
}

export interface TierAvailability {
  readonly code: string;
  readonly name: string;
  readonly price: Money;
  readonly available: number;
  readonly total: number;
}

export interface AvailabilitySnapshot {
  readonly ticketedEventId: string;
  readonly generatedAt: Date;
  readonly totals: Readonly<Record<SeatStatus, number>>;
  readonly tiers: readonly TierAvailability[];
  readonly sections: readonly SectionAvailability[];
}

/**
 * Builds the public seat map. Lapsed holds are reported as held until the sweeper frees them,
 * which keeps the snapshot a pure function of stored state and therefore safely cacheable.
 */
export function buildAvailabilitySnapshot(
  event: TicketedEvent,
  seats: readonly Seat[],
  generatedAt: Date,
): AvailabilitySnapshot {
  const bySeatId = new Map(seats.map((seat) => [seat.id.toString(), seat]));
  const totals: Record<SeatStatus, number> = { available: 0, held: 0, booked: 0 };
  const perTier = new Map<string, { available: number; total: number }>();

  for (const seat of seats) {
    totals[seat.status] += 1;
    const tier = perTier.get(seat.tierCode) ?? { available: 0, total: 0 };
    tier.total += 1;
    tier.available += seat.status === 'available' ? 1 : 0;
    perTier.set(seat.tierCode, tier);
  }

  const sections = event.sections.map((section) => ({
    name: section.name,
    rows: section.rows.map((row) => ({
      name: row.name,
      seats: Array.from({ length: row.seatCount }, (_, index) => {
        const seat = bySeatId.get(`${section.name}-${row.name}-${index + 1}`);
        return seat
          ? [{ seatId: seat.id.toString(), number: seat.id.number, tierCode: seat.tierCode, status: seat.status }]
          : [];
      }).flat(),
    })),
  }));

  const tiers = event.pricingTiers.map((tier) => ({
    code: tier.code,
    name: tier.name,
    price: tier.price,
    available: perTier.get(tier.code)?.available ?? 0,
    total: perTier.get(tier.code)?.total ?? 0,
  }));

  return { ticketedEventId: event.id, generatedAt, totals, tiers, sections };
}
