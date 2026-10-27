import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '../../../shared/auth/principal';
import { CLOCK, type Clock } from '../../../shared/application/clock';
import { ConcurrencyConflictError } from '../../../shared/application/errors';
import { UnitOfWork } from '../../../shared/application/unit-of-work';
import { SeatInventory } from '../../events/application/seat-inventory.service';
import { HOLD_REPOSITORY, type HoldRepository } from '../../holds/application/ports';
import { HoldNotFoundError } from '../../holds/domain/errors';
import { Booking } from '../domain/booking';
import { IdempotencyKeyReusedError } from '../domain/errors';
import type { IdempotencyKey } from '../domain/idempotency-key';
import { BOOKING_REPOSITORY, type BookingRepository } from './ports';

export interface ConfirmHoldCommand {
  readonly holdId: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly principal: Principal;
}

export interface ConfirmHoldResult {
  readonly booking: Booking;
  /** True when an earlier request with the same key already produced this booking. */
  readonly replayed: boolean;
}

@Injectable()
export class ConfirmHoldUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly inventory: SeatInventory,
    @Inject(HOLD_REPOSITORY) private readonly holds: HoldRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ConfirmHoldCommand): Promise<ConfirmHoldResult> {
    const replay = await this.findReplay(command);
    if (replay) {
      return { booking: replay, replayed: true };
    }

    try {
      const booking = await this.confirm(command);
      return { booking, replayed: false };
    } catch (error) {
      // Two requests with the same key raced: the loser hits the unique key or the hold's
      // version check. If the winner's booking exists, answer exactly as a replay would.
      if (error instanceof ConcurrencyConflictError) {
        const winner = await this.findReplay(command);
        if (winner) {
          return { booking: winner, replayed: true };
        }
      }
      throw error;
    }
  }

  private confirm(command: ConfirmHoldCommand): Promise<Booking> {
    return this.unitOfWork.execute(async (recordEvents) => {
      const now = this.clock.now();
      const hold = await this.holds.findById(command.holdId);
      // Only the holder confirms: the idempotency key is scoped to the holder.
      if (!hold || hold.holderId !== command.principal.id) {
        throw new HoldNotFoundError(command.holdId);
      }
      hold.confirm(now);

      const booking = Booking.confirm({
        id: randomUUID(),
        holdId: hold.id,
        ticketedEventId: hold.ticketedEventId,
        holderId: hold.holderId,
        idempotencyKey: command.idempotencyKey,
        seats: hold.seats,
        total: hold.total,
        now,
      });

      await this.inventory.book(hold.ticketedEventId, hold.seatIds, hold.id, booking.id);
      await this.holds.save(hold);
      await this.bookings.insert(booking);
      recordEvents(booking.pullEvents());
      return booking;
    });
  }

  private async findReplay(command: ConfirmHoldCommand): Promise<Booking | null> {
    const existing = await this.bookings.findByIdempotencyKey(
      command.principal.id,
      command.idempotencyKey.value,
    );
    if (!existing) {
      return null;
    }
    if (existing.holdId !== command.holdId) {
      throw new IdempotencyKeyReusedError(command.idempotencyKey.value);
    }
    return existing;
  }
}
