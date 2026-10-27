import { SeatsUnavailableError } from './errors';
import type { SeatId } from './seat-id';

export type SeatStatus = 'available' | 'held' | 'booked';

export interface SeatState {
  readonly ticketedEventId: string;
  readonly seatId: SeatId;
  readonly tierCode: string;
  readonly status: SeatStatus;
  readonly holdId: string | null;
  readonly heldUntil: Date | null;
  readonly bookingId: string | null;
  /** Optimistic concurrency token; repositories reject writes based on a stale version. */
  readonly version: number;
}

/**
 * A single sellable seat. It is its own consistency boundary so that two customers
 * competing for different seats of the same event never conflict with each other.
 */
export class Seat {
  private constructor(private state: SeatState) {}

  static create(ticketedEventId: string, seatId: SeatId, tierCode: string): Seat {
    return new Seat({
      ticketedEventId,
      seatId,
      tierCode,
      status: 'available',
      holdId: null,
      heldUntil: null,
      bookingId: null,
      version: 0,
    });
  }

  static restore(state: SeatState): Seat {
    return new Seat(state);
  }

  get id(): SeatId {
    return this.state.seatId;
  }

  get tierCode(): string {
    return this.state.tierCode;
  }

  get status(): SeatStatus {
    return this.state.status;
  }

  get version(): number {
    return this.state.version;
  }

  /**
   * A hold that has lapsed but not yet been swept no longer protects the seat. The write
   * path relies on this so sales never wait for the expiry job.
   */
  isAvailableAt(now: Date): boolean {
    if (this.state.status === 'available') {
      return true;
    }
    return this.state.status === 'held' && this.state.heldUntil !== null && this.state.heldUntil <= now;
  }

  hold(holdId: string, until: Date, now: Date): void {
    if (!this.isAvailableAt(now)) {
      throw new SeatsUnavailableError([this.id.toString()]);
    }
    this.state = { ...this.state, status: 'held', holdId, heldUntil: until, bookingId: null };
  }

  /** Returns false when the seat no longer belongs to the hold, e.g. after a takeover. */
  releaseHold(holdId: string): boolean {
    if (this.state.status !== 'held' || this.state.holdId !== holdId) {
      return false;
    }
    this.state = { ...this.state, status: 'available', holdId: null, heldUntil: null };
    return true;
  }

  book(holdId: string, bookingId: string): void {
    if (this.state.status !== 'held' || this.state.holdId !== holdId) {
      throw new SeatsUnavailableError([this.id.toString()]);
    }
    this.state = { ...this.state, status: 'booked', heldUntil: null, bookingId };
  }

  releaseBooking(bookingId: string): boolean {
    if (this.state.status !== 'booked' || this.state.bookingId !== bookingId) {
      return false;
    }
    this.state = { ...this.state, status: 'available', holdId: null, bookingId: null };
    return true;
  }

  snapshot(): SeatState {
    return this.state;
  }
}
