import { type Selectable, sql } from 'kysely';
import { ConcurrencyConflictError } from '../../../shared/application/errors';
import { Money } from '../../../shared/domain/money';
import type { SeatsTable } from '../../../shared/persistence/postgres/database';
import type { KyselyDatabase } from '../../../shared/persistence/postgres/kysely-database';
import type { SeatRepository, TicketedEventRepository } from '../application/ports';
import { PricingTier } from '../domain/pricing-tier';
import { Seat } from '../domain/seat';
import { SeatId } from '../domain/seat-id';
import { TicketedEvent } from '../domain/ticketed-event';

/** Postgres caps bind parameters per statement; chunking keeps big venues under the limit. */
const SEAT_INSERT_CHUNK_SIZE = 1_000;
const INITIAL_VERSION = 1;

export class KyselyTicketedEventRepository implements TicketedEventRepository {
  constructor(private readonly database: KyselyDatabase) {}

  async insert(event: TicketedEvent): Promise<void> {
    const state = event.snapshot();
    await this.database.executor
      .insertInto('ticketed_events')
      .values({
        id: state.id,
        name: state.name,
        venue: state.venue,
        starts_at: state.startsAt,
        currency: state.currency,
        pricing_tiers: JSON.stringify(
          state.pricingTiers.map((tier) => ({
            code: tier.code,
            name: tier.name,
            priceMinor: tier.price.amountMinor,
          })),
        ),
        layout: JSON.stringify(state.sections),
        created_at: state.createdAt,
      })
      .execute();
  }

  async findById(id: string): Promise<TicketedEvent | null> {
    const row = await this.database.executor
      .selectFrom('ticketed_events')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      return null;
    }
    return TicketedEvent.restore({
      id: row.id,
      name: row.name,
      venue: row.venue,
      startsAt: row.starts_at,
      currency: row.currency,
      pricingTiers: row.pricing_tiers.map((tier) =>
        PricingTier.create(tier.code, tier.name, Money.of(tier.priceMinor, row.currency)),
      ),
      sections: row.layout,
      createdAt: row.created_at,
    });
  }
}

export class KyselySeatRepository implements SeatRepository {
  constructor(private readonly database: KyselyDatabase) {}

  async insertMany(seats: readonly Seat[]): Promise<void> {
    for (let offset = 0; offset < seats.length; offset += SEAT_INSERT_CHUNK_SIZE) {
      const chunk = seats.slice(offset, offset + SEAT_INSERT_CHUNK_SIZE);
      await this.database.executor
        .insertInto('seats')
        .values(chunk.map((seat) => ({ ...toColumns(seat), version: INITIAL_VERSION })))
        .execute();
    }
  }

  async findByEvent(ticketedEventId: string): Promise<Seat[]> {
    const rows = await this.database.executor
      .selectFrom('seats')
      .selectAll()
      .where('event_id', '=', ticketedEventId)
      .execute();
    return rows.map(toSeat);
  }

  async findByIds(ticketedEventId: string, seatIds: readonly SeatId[]): Promise<Seat[]> {
    if (seatIds.length === 0) {
      return [];
    }
    const rows = await this.database.executor
      .selectFrom('seats')
      .selectAll()
      .where('event_id', '=', ticketedEventId)
      .where(
        'seat_id',
        'in',
        seatIds.map((seatId) => seatId.toString()),
      )
      .execute();
    return rows.map(toSeat);
  }

  async saveAll(seats: readonly Seat[]): Promise<void> {
    for (const seat of seats) {
      const columns = toColumns(seat);
      const result = await this.database.executor
        .updateTable('seats')
        .set({
          status: columns.status,
          hold_id: columns.hold_id,
          held_until: columns.held_until,
          booking_id: columns.booking_id,
          version: sql<number>`version + 1`,
        })
        .where('event_id', '=', columns.event_id)
        .where('seat_id', '=', columns.seat_id)
        .where('version', '=', seat.version)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) {
        throw new ConcurrencyConflictError('seat', columns.seat_id);
      }
    }
  }
}

function toColumns(seat: Seat): Omit<Selectable<SeatsTable>, 'version'> {
  const state = seat.snapshot();
  return {
    event_id: state.ticketedEventId,
    seat_id: state.seatId.toString(),
    tier_code: state.tierCode,
    status: state.status,
    hold_id: state.holdId,
    held_until: state.heldUntil,
    booking_id: state.bookingId,
  };
}

function toSeat(row: Selectable<SeatsTable>): Seat {
  return Seat.restore({
    ticketedEventId: row.event_id,
    seatId: SeatId.parse(row.seat_id),
    tierCode: row.tier_code,
    status: row.status,
    holdId: row.hold_id,
    heldUntil: row.held_until,
    bookingId: row.booking_id,
    version: row.version,
  });
}
