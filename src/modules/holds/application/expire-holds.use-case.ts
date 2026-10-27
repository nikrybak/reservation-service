import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/application/clock';
import { ConcurrencyConflictError } from '../../../shared/application/errors';
import { UnitOfWork } from '../../../shared/application/unit-of-work';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/app-config';
import { SeatInventory } from '../../events/application/seat-inventory.service';
import { HOLD_REPOSITORY, type HoldRepository } from './ports';

export interface ExpiryReport {
  readonly expired: number;
  readonly skipped: number;
}

@Injectable()
export class ExpireHoldsUseCase {
  private readonly logger = new Logger(ExpireHoldsUseCase.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly inventory: SeatInventory,
    @Inject(HOLD_REPOSITORY) private readonly holds: HoldRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Each hold expires in its own transaction so one conflict never blocks the whole batch. */
  async execute(): Promise<ExpiryReport> {
    const now = this.clock.now();
    const ids = await this.holds.findExpiredActiveIds(now, this.config.holds.sweepBatchSize);
    let expired = 0;

    for (const id of ids) {
      try {
        const done = await this.expireOne(id, now);
        expired += done ? 1 : 0;
      } catch (error) {
        if (!(error instanceof ConcurrencyConflictError)) {
          throw error;
        }
        // The holder confirmed or released it in the meantime; nothing left to expire.
        this.logger.debug({ holdId: id }, 'Hold changed during expiry, skipped');
      }
    }
    return { expired, skipped: ids.length - expired };
  }

  private expireOne(id: string, now: Date): Promise<boolean> {
    return this.unitOfWork.execute(async (recordEvents) => {
      const hold = await this.holds.findById(id);
      if (!hold || hold.status !== 'active' || !hold.isExpiredAt(now)) {
        return false;
      }
      hold.expire(now);
      await this.inventory.releaseHold(hold.ticketedEventId, hold.seatIds, hold.id);
      await this.holds.save(hold);
      recordEvents(hold.pullEvents());
      return true;
    });
  }
}
