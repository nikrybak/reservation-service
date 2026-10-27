import { Inject, Injectable } from '@nestjs/common';
import { SeatsUnavailableError, UnknownSeatsError } from '../domain/errors';
import type { Seat } from '../domain/seat';
import { SeatId } from '../domain/seat-id';
import { SEAT_REPOSITORY, type SeatRepository } from './ports';

/**
 * Seat state transitions used by the holds and bookings slices. It must be called inside
 * a unit of work: every write is version-checked and only commits with the caller's changes.
 */
@Injectable()
export class SeatInventory {
  constructor(@Inject(SEAT_REPOSITORY) private readonly seats: SeatRepository) {}

  /** Loads the requested seats and fails unless every one of them can be held right now. */
  async loadAvailable(ticketedEventId: string, rawSeatIds: readonly string[], now: Date): Promise<Seat[]> {
    const seatIds = rawSeatIds.map((raw) => SeatId.parse(raw));
    const seats = await this.seats.findByIds(ticketedEventId, seatIds);

    const found = new Set(seats.map((seat) => seat.id.toString()));
    const missing = rawSeatIds.filter((seatId) => !found.has(seatId));
    if (missing.length > 0) {
      throw new UnknownSeatsError(missing);
    }

    const taken = seats.filter((seat) => !seat.isAvailableAt(now)).map((seat) => seat.id.toString());
    if (taken.length > 0) {
      throw new SeatsUnavailableError(taken);
    }
    return seats;
  }

  async hold(seats: readonly Seat[], holdId: string, until: Date, now: Date): Promise<void> {
    seats.forEach((seat) => seat.hold(holdId, until, now));
    await this.seats.saveAll(seats);
  }

  async book(ticketedEventId: string, seatIds: readonly string[], holdId: string, bookingId: string): Promise<void> {
    const seats = await this.load(ticketedEventId, seatIds);
    seats.forEach((seat) => seat.book(holdId, bookingId));
    await this.seats.saveAll(seats);
  }

  async releaseHold(ticketedEventId: string, seatIds: readonly string[], holdId: string): Promise<void> {
    const seats = await this.load(ticketedEventId, seatIds);
    await this.seats.saveAll(seats.filter((seat) => seat.releaseHold(holdId)));
  }

  async releaseBooking(ticketedEventId: string, seatIds: readonly string[], bookingId: string): Promise<void> {
    const seats = await this.load(ticketedEventId, seatIds);
    await this.seats.saveAll(seats.filter((seat) => seat.releaseBooking(bookingId)));
  }

  private load(ticketedEventId: string, seatIds: readonly string[]): Promise<Seat[]> {
    return this.seats.findByIds(
      ticketedEventId,
      seatIds.map((raw) => SeatId.parse(raw)),
    );
  }
}
