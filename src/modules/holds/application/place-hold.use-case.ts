import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '../../../shared/auth/principal';
import { CLOCK, type Clock } from '../../../shared/application/clock';
import { ConcurrencyConflictError } from '../../../shared/application/errors';
import { UnitOfWork } from '../../../shared/application/unit-of-work';
import {
  TICKETED_EVENT_REPOSITORY,
  type TicketedEventRepository,
} from '../../events/application/ports';
import { SeatInventory } from '../../events/application/seat-inventory.service';
import { EventNotFoundError, SeatsUnavailableError } from '../../events/domain/errors';
import { Hold } from '../domain/hold';
import type { HoldPolicy } from '../domain/hold-policy';
import { HOLD_POLICY, HOLD_REPOSITORY, type HoldRepository } from './ports';

export interface PlaceHoldCommand {
  readonly ticketedEventId: string;
  readonly seatIds: readonly string[];
  readonly ttlSeconds?: number;
  readonly principal: Principal;
}

@Injectable()
export class PlaceHoldUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly inventory: SeatInventory,
    @Inject(TICKETED_EVENT_REPOSITORY) private readonly events: TicketedEventRepository,
    @Inject(HOLD_REPOSITORY) private readonly holds: HoldRepository,
    @Inject(HOLD_POLICY) private readonly policy: HoldPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: PlaceHoldCommand): Promise<Hold> {
    const now = this.clock.now();
    const event = await this.events.findById(command.ticketedEventId);
    if (!event) {
      throw new EventNotFoundError(command.ticketedEventId);
    }
    event.assertOpenForSales(now);
    this.policy.assertSeatCount(command.seatIds.length);

    try {
      return await this.unitOfWork.execute(async (recordEvents) => {
        const seats = await this.inventory.loadAvailable(event.id, command.seatIds, now);
        const hold = Hold.place(
          {
            id: randomUUID(),
            ticketedEventId: event.id,
            holderId: command.principal.id,
            currency: event.currency,
            seats: seats.map((seat) => ({
              seatId: seat.id.toString(),
              tierCode: seat.tierCode,
              price: event.priceOf(seat.tierCode),
            })),
            ...(command.ttlSeconds === undefined ? {} : { ttlSeconds: command.ttlSeconds }),
            now,
          },
          this.policy,
        );
        await this.inventory.hold(seats, hold.id, hold.expiresAt, now);
        await this.holds.insert(hold);
        recordEvents(hold.pullEvents());
        return hold;
      });
    } catch (error) {
      // Losing a version race on a seat means another customer got there first; retrying
      // cannot succeed, so report it exactly like a seat that was already taken.
      if (error instanceof ConcurrencyConflictError) {
        throw new SeatsUnavailableError(command.seatIds);
      }
      throw error;
    }
  }
}
