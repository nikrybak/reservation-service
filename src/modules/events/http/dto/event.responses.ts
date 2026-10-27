import { MoneyResponse } from '../../../../shared/http/money.response';
import type { AvailabilitySnapshot } from '../../application/availability';
import type { CreatedEvent } from '../../application/create-event.use-case';
import type { SeatStatus } from '../../domain/seat';

export class PricingTierResponse {
  constructor(
    readonly code: string,
    readonly name: string,
    readonly price: MoneyResponse,
  ) {}
}

export class EventResponse {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly venue: string,
    readonly startsAt: string,
    readonly currency: string,
    readonly seatCount: number,
    readonly pricingTiers: readonly PricingTierResponse[],
    readonly createdAt: string,
  ) {}

  static from({ event, seatCount }: CreatedEvent): EventResponse {
    const state = event.snapshot();
    return new EventResponse(
      state.id,
      state.name,
      state.venue,
      state.startsAt.toISOString(),
      state.currency,
      seatCount,
      state.pricingTiers.map(
        (tier) => new PricingTierResponse(tier.code, tier.name, MoneyResponse.from(tier.price)),
      ),
      state.createdAt.toISOString(),
    );
  }
}

interface SeatEntry {
  readonly id: string;
  readonly number: number;
  readonly tier: string;
  readonly status: SeatStatus;
}

interface TierEntry {
  readonly code: string;
  readonly name: string;
  readonly price: MoneyResponse;
  readonly available: number;
  readonly total: number;
}

interface SectionEntry {
  readonly name: string;
  readonly rows: ReadonlyArray<{ readonly name: string; readonly seats: readonly SeatEntry[] }>;
}

export class AvailabilityResponse {
  private constructor(
    readonly eventId: string,
    readonly generatedAt: string,
    readonly totals: Readonly<Record<SeatStatus, number>>,
    readonly tiers: readonly TierEntry[],
    readonly sections: readonly SectionEntry[],
  ) {}

  static from(snapshot: AvailabilitySnapshot): AvailabilityResponse {
    return new AvailabilityResponse(
      snapshot.ticketedEventId,
      snapshot.generatedAt.toISOString(),
      snapshot.totals,
      snapshot.tiers.map((tier) => ({
        code: tier.code,
        name: tier.name,
        price: MoneyResponse.from(tier.price),
        available: tier.available,
        total: tier.total,
      })),
      snapshot.sections.map((section) => ({
        name: section.name,
        rows: section.rows.map((row) => ({
          name: row.name,
          seats: row.seats.map((seat) => ({
            id: seat.seatId,
            number: seat.number,
            tier: seat.tierCode,
            status: seat.status,
          })),
        })),
      })),
    );
  }
}
