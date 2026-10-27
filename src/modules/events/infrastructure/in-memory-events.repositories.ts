import { Money } from '../../../shared/domain/money';
import type { InMemoryStore, InMemoryTable } from '../../../shared/persistence/in-memory/in-memory-store';
import type { SeatRepository, TicketedEventRepository } from '../application/ports';
import { PricingTier } from '../domain/pricing-tier';
import { Seat, type SeatStatus } from '../domain/seat';
import { SeatId } from '../domain/seat-id';
import { type SectionLayout, TicketedEvent } from '../domain/ticketed-event';

interface EventRow {
  id: string;
  name: string;
  venue: string;
  startsAt: Date;
  currency: string;
  pricingTiers: Array<{ code: string; name: string; priceMinor: number }>;
  sections: SectionLayout[];
  createdAt: Date;
  version: number;
}

interface SeatRow {
  ticketedEventId: string;
  seatId: string;
  tierCode: string;
  status: SeatStatus;
  holdId: string | null;
  heldUntil: Date | null;
  bookingId: string | null;
  version: number;
}

export class InMemoryTicketedEventRepository implements TicketedEventRepository {
  private readonly table: InMemoryTable<EventRow>;

  constructor(store: InMemoryStore) {
    this.table = store.table<EventRow>('ticketed_events');
  }

  insert(event: TicketedEvent): Promise<void> {
    const state = event.snapshot();
    this.table.insert(state.id, {
      id: state.id,
      name: state.name,
      venue: state.venue,
      startsAt: state.startsAt,
      currency: state.currency,
      pricingTiers: state.pricingTiers.map((tier) => ({
        code: tier.code,
        name: tier.name,
        priceMinor: tier.price.amountMinor,
      })),
      sections: structuredClone([...state.sections]),
      createdAt: state.createdAt,
    });
    return Promise.resolve();
  }

  findById(id: string): Promise<TicketedEvent | null> {
    const row = this.table.get(id);
    return Promise.resolve(
      row
        ? TicketedEvent.restore({
            ...row,
            pricingTiers: row.pricingTiers.map((tier) =>
              PricingTier.create(tier.code, tier.name, Money.of(tier.priceMinor, row.currency)),
            ),
          })
        : null,
    );
  }
}

export class InMemorySeatRepository implements SeatRepository {
  private readonly table: InMemoryTable<SeatRow>;

  constructor(store: InMemoryStore) {
    this.table = store.table<SeatRow>('seats');
  }

  insertMany(seats: readonly Seat[]): Promise<void> {
    for (const seat of seats) {
      const state = seat.snapshot();
      this.table.insert(seatKey(state.ticketedEventId, state.seatId), toRow(seat));
    }
    return Promise.resolve();
  }

  findByEvent(ticketedEventId: string): Promise<Seat[]> {
    return Promise.resolve(
      this.table
        .all()
        .filter((row) => row.ticketedEventId === ticketedEventId)
        .map(toSeat),
    );
  }

  findByIds(ticketedEventId: string, seatIds: readonly SeatId[]): Promise<Seat[]> {
    const seats = seatIds
      .map((seatId) => this.table.get(seatKey(ticketedEventId, seatId)))
      .filter((row): row is SeatRow => row !== undefined)
      .map(toSeat);
    return Promise.resolve(seats);
  }

  saveAll(seats: readonly Seat[]): Promise<void> {
    for (const seat of seats) {
      const state = seat.snapshot();
      this.table.update(seatKey(state.ticketedEventId, state.seatId), toRow(seat), state.version);
    }
    return Promise.resolve();
  }
}

function seatKey(ticketedEventId: string, seatId: SeatId): string {
  return `${ticketedEventId}/${seatId.toString()}`;
}

function toRow(seat: Seat): Omit<SeatRow, 'version'> {
  const state = seat.snapshot();
  return {
    ticketedEventId: state.ticketedEventId,
    seatId: state.seatId.toString(),
    tierCode: state.tierCode,
    status: state.status,
    holdId: state.holdId,
    heldUntil: state.heldUntil,
    bookingId: state.bookingId,
  };
}

function toSeat(row: SeatRow): Seat {
  return Seat.restore({ ...row, seatId: SeatId.parse(row.seatId) });
}
