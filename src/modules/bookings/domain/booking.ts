import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { createDomainEvent } from '../../../shared/domain/domain-event';
import type { Money } from '../../../shared/domain/money';
import type { HeldSeat } from '../../holds/domain/hold';
import { BookingAlreadyCancelledError } from './errors';
import type { IdempotencyKey } from './idempotency-key';

export type BookingStatus = 'confirmed' | 'cancelled';

export interface BookingState {
  readonly id: string;
  readonly holdId: string;
  readonly ticketedEventId: string;
  readonly holderId: string;
  readonly idempotencyKey: string;
  readonly seats: readonly HeldSeat[];
  readonly total: Money;
  readonly status: BookingStatus;
  readonly createdAt: Date;
  readonly cancelledAt: Date | null;
  readonly version: number;
}

export interface ConfirmBookingInput {
  readonly id: string;
  readonly holdId: string;
  readonly ticketedEventId: string;
  readonly holderId: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly seats: readonly HeldSeat[];
  readonly total: Money;
  readonly now: Date;
}

export class Booking extends AggregateRoot {
  private constructor(private state: BookingState) {
    super();
  }

  static confirm(input: ConfirmBookingInput): Booking {
    const booking = new Booking({
      id: input.id,
      holdId: input.holdId,
      ticketedEventId: input.ticketedEventId,
      holderId: input.holderId,
      idempotencyKey: input.idempotencyKey.value,
      seats: input.seats,
      total: input.total,
      status: 'confirmed',
      createdAt: input.now,
      cancelledAt: null,
      version: 0,
    });
    booking.recordChange('BookingConfirmed', input.now, {
      holdId: input.holdId,
      holderId: input.holderId,
      totalMinor: input.total.amountMinor,
      currency: input.total.currency,
    });
    return booking;
  }

  static restore(state: BookingState): Booking {
    return new Booking(state);
  }

  get id(): string {
    return this.state.id;
  }

  get holdId(): string {
    return this.state.holdId;
  }

  get ticketedEventId(): string {
    return this.state.ticketedEventId;
  }

  get holderId(): string {
    return this.state.holderId;
  }

  get seatIds(): string[] {
    return this.state.seats.map((seat) => seat.seatId);
  }

  get status(): BookingStatus {
    return this.state.status;
  }

  get version(): number {
    return this.state.version;
  }

  cancel(now: Date, reason: string | null): void {
    if (this.state.status === 'cancelled') {
      throw new BookingAlreadyCancelledError(this.state.id);
    }
    this.state = { ...this.state, status: 'cancelled', cancelledAt: now };
    this.recordChange('BookingCancelled', now, { reason });
  }

  snapshot(): BookingState {
    return this.state;
  }

  private recordChange(
    name: 'BookingConfirmed' | 'BookingCancelled',
    occurredAt: Date,
    extra: Record<string, unknown>,
  ): void {
    this.record(
      createDomainEvent({
        name,
        aggregateId: this.state.id,
        ticketedEventId: this.state.ticketedEventId,
        occurredAt,
        payload: { bookingId: this.state.id, seatIds: this.seatIds, ...extra },
      }),
    );
  }
}
