import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/app-config';
import { ExpireHoldsUseCase } from '../application/expire-holds.use-case';

const JOB_NAME = 'hold-expiry';

/**
 * Registered dynamically instead of with @Interval so the period comes from validated config
 * and can be switched off in tests that drive expiry themselves.
 */
@Injectable()
export class HoldExpiryScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HoldExpiryScheduler.name);
  private running = false;

  constructor(
    private readonly expireHolds: ExpireHoldsUseCase,
    private readonly scheduler: SchedulerRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = this.config.holds.sweepIntervalMs;
    if (intervalMs <= 0) {
      return;
    }
    this.scheduler.addInterval(
      JOB_NAME,
      setInterval(() => void this.tick(), intervalMs),
    );
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', JOB_NAME)) {
      this.scheduler.deleteInterval(JOB_NAME);
    }
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const report = await this.expireHolds.execute();
      if (report.expired > 0) {
        this.logger.log(report, 'Expired holds');
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Hold expiry sweep failed');
    } finally {
      this.running = false;
    }
  }
}
