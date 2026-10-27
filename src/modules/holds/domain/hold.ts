import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { createDomainEvent } from '../../../shared/domain/domain-event';
import { Money } from '../../../shared/domain/money';
import { HoldExpiredError, HoldNotActiveError, InvalidHoldError } from './errors';
import type { HoldPolicy } from './hold-policy';

const MS_PER_SECOND = 1000;

export type HoldStatus = 'active' | 'confirmed' | 'released' | 'expired';

export interface HeldSeat {
  readonly seatId: string;
  readonly tierCode: string;
  readonly price: Money;
}

export interface HoldState {
  readonly id: string;
  readonly ticketedEventId: string;
  readonly holderId: string;
  readonly seats: readonly HeldSeat[];
  readonly total: Money;
  readonly status: HoldStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly version: number;
}

export interface PlaceHoldInput {
  readonly id: string;
  readonly ticketedEventId: string;
  readonly holderId: string;
  readonly currency: string;
  readonly seats: readonly HeldSeat[];
  readonly ttlSeconds?: number;
  readonly now: Date;
}

export class Hold extends AggregateRoot {
  private constructor(private state: HoldState) {
    super();
  }

  static place(input: PlaceHoldInput, policy: HoldPolicy): Hold {
    policy.assertSeatCount(input.seats.length);
    const seatIds = input.seats.map((seat) => seat.seatId);
    if (new Set(seatIds).size !== seatIds.length) {
      throw new InvalidHoldError('A hold cannot contain the same seat twice', { seatIds });
    }

    const ttlSeconds = policy.resolveTtlSeconds(input.ttlSeconds);
    const hold = new Hold({
      id: input.id,
      ticketedEventId: input.ticketedEventId,
      holderId: input.holderId,
      seats: input.seats,
      total: Money.sum(
        input.seats.map((seat) => seat.price),
        input.currency,
      ),
      status: 'active',
      createdAt: input.now,
      expiresAt: new Date(input.now.getTime() + ttlSeconds * MS_PER_SECOND),
      version: 0,
    });

    hold.recordChange('SeatsHeld', input.now, {
      holderId: input.holderId,
      expiresAt: hold.expiresAt.toISOString(),
      totalMinor: hold.total.amountMinor,
      currency: hold.total.currency,
    });
    return hold;
  }

  static restore(state: HoldState): Hold {
    return new Hold(state);
  }

  get id(): string {
    return this.state.id;
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

  get seats(): readonly HeldSeat[] {
    return this.state.seats;
  }

  get total(): Money {
    return this.state.total;
  }

  get status(): HoldStatus {
    return this.state.status;
  }

  get expiresAt(): Date {
    return this.state.expiresAt;
  }

  get version(): number {
    return this.state.version;
  }

  isExpiredAt(now: Date): boolean {
    return now >= this.state.expiresAt;
  }

  /** Marks the hold as converted; the booking aggregate records the business event. */
  confirm(now: Date): void {
    this.assertActive();
    if (this.isExpiredAt(now)) {
      throw new HoldExpiredError(this.state.id, this.state.expiresAt);
    }
    this.state = { ...this.state, status: 'confirmed' };
  }

  release(now: Date): void {
    this.assertActive();
    this.state = { ...this.state, status: 'released' };
    this.recordChange('HoldReleased', now);
  }

  expire(now: Date): void {
    this.assertActive();
    if (!this.isExpiredAt(now)) {
      throw new InvalidHoldError('Hold cannot expire before its deadline', {
        holdId: this.state.id,
        expiresAt: this.state.expiresAt.toISOString(),
      });
    }
    this.state = { ...this.state, status: 'expired' };
    this.recordChange('HoldExpired', now);
  }

  snapshot(): HoldState {
    return this.state;
  }

  private assertActive(): void {
    if (this.state.status !== 'active') {
      throw new HoldNotActiveError(this.state.id, this.state.status);
    }
  }

  private recordChange(
    name: 'SeatsHeld' | 'HoldReleased' | 'HoldExpired',
    occurredAt: Date,
    extra: Record<string, unknown> = {},
  ): void {
    this.record(
      createDomainEvent({
        name,
        aggregateId: this.state.id,
        ticketedEventId: this.state.ticketedEventId,
        occurredAt,
        payload: { holdId: this.state.id, seatIds: this.seatIds, ...extra },
      }),
    );
  }
}
