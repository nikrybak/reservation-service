import { Inject, Injectable } from '@nestjs/common';
import { canActOn, type Principal } from '../../../shared/auth/principal';
import { CLOCK, type Clock } from '../../../shared/application/clock';
import { UnitOfWork } from '../../../shared/application/unit-of-work';
import { SeatInventory } from '../../events/application/seat-inventory.service';
import { HoldNotFoundError } from '../domain/errors';
import { HOLD_REPOSITORY, type HoldRepository } from './ports';

@Injectable()
export class ReleaseHoldUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly inventory: SeatInventory,
    @Inject(HOLD_REPOSITORY) private readonly holds: HoldRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(holdId: string, principal: Principal): Promise<void> {
    await this.unitOfWork.execute(async (recordEvents) => {
      const hold = await this.holds.findById(holdId);
      // Foreign holds are reported as missing so ids cannot be probed.
      if (!hold || !canActOn(principal, hold.holderId)) {
        throw new HoldNotFoundError(holdId);
      }
      hold.release(this.clock.now());
      await this.inventory.releaseHold(hold.ticketedEventId, hold.seatIds, hold.id);
      await this.holds.save(hold);
      recordEvents(hold.pullEvents());
    });
  }
}
