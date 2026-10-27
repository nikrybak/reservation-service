import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../application/clock';
import {
  OUTBOX_REPOSITORY,
  type OutboxMessage,
  type OutboxRepository,
} from '../../application/outbox.repository';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { EventSubscribers } from './event-subscribers';

const MAX_RETRY_DELAY_MS = 5 * 60_000;
const MAX_ERROR_LENGTH = 2_000;

export interface DispatchReport {
  readonly published: number;
  readonly failed: number;
  readonly dead: number;
}

export function retryDelayMs(attempts: number, baseDelayMs: number): number {
  return Math.min(baseDelayMs * 2 ** Math.max(attempts - 1, 0), MAX_RETRY_DELAY_MS);
}

@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);

  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    private readonly subscribers: EventSubscribers,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async dispatchPending(): Promise<DispatchReport> {
    const now = this.clock.now();
    const { batchSize, leaseMs } = this.config.outbox;
    const messages = await this.outbox.claimDue(now, batchSize, new Date(now.getTime() + leaseMs));

    let published = 0;
    let failed = 0;
    let dead = 0;
    for (const message of messages) {
      try {
        await this.subscribers.deliver(message);
        await this.outbox.markPublished(message.id, this.clock.now());
        published += 1;
      } catch (error) {
        const isDead = await this.recordFailure(message, error);
        failed += 1;
        dead += isDead ? 1 : 0;
      }
    }
    return { published, failed, dead };
  }

  private async recordFailure(message: OutboxMessage, error: unknown): Promise<boolean> {
    const { maxAttempts, retryBaseDelayMs } = this.config.outbox;
    const attempts = message.attempts + 1;
    const dead = attempts >= maxAttempts;
    const now = this.clock.now();
    await this.outbox.markFailed(message.id, {
      attempts,
      dead,
      error: describe(error).slice(0, MAX_ERROR_LENGTH),
      nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts, retryBaseDelayMs)),
    });
    const log = { messageId: message.id, event: message.name, attempts, err: error };
    if (dead) {
      this.logger.error(log, 'Outbox message moved to dead letter after final attempt');
    } else {
      this.logger.warn(log, 'Outbox delivery failed, will retry');
    }
    return dead;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
