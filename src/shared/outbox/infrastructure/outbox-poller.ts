import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CommittedEventsBus } from '../../application/committed-events.bus';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { OutboxDispatcher } from '../application/outbox-dispatcher';

const JOB_NAME = 'outbox-dispatch';

/**
 * Polling is the safety net that guarantees delivery and drives retries; the commit hook
 * only shortens latency for the common case where the process stays up.
 */
@Injectable()
export class OutboxPoller implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxPoller.name);
  private running = false;
  private stopped = false;

  constructor(
    private readonly dispatcher: OutboxDispatcher,
    private readonly committedEvents: CommittedEventsBus,
    private readonly scheduler: SchedulerRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = this.config.outbox.pollIntervalMs;
    if (intervalMs <= 0) {
      return;
    }
    this.scheduler.addInterval(
      JOB_NAME,
      setInterval(() => void this.tick(), intervalMs),
    );
    this.committedEvents.subscribe(() => setImmediate(() => void this.tick()));
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    if (this.scheduler.doesExist('interval', JOB_NAME)) {
      this.scheduler.deleteInterval(JOB_NAME);
    }
  }

  async tick(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    try {
      await this.dispatcher.dispatchPending();
    } catch (error) {
      this.logger.error({ err: error }, 'Outbox dispatch cycle failed');
    } finally {
      this.running = false;
    }
  }
}
