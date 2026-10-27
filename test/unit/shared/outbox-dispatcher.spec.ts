import { createDomainEvent } from '../../../src/shared/domain/domain-event';
import { EventSubscribers } from '../../../src/shared/outbox/application/event-subscribers';
import {
  OutboxDispatcher,
  retryDelayMs,
} from '../../../src/shared/outbox/application/outbox-dispatcher';
import { InMemoryOutboxRepository } from '../../../src/shared/outbox/infrastructure/in-memory-outbox.repository';
import { InMemoryStore } from '../../../src/shared/persistence/in-memory/in-memory-store';
import type { OutboxMessage } from '../../../src/shared/application/outbox.repository';
import { FakeClock } from '../../support/fake-clock';
import { testConfig } from '../../support/fixtures';

function setup(handle: (message: OutboxMessage) => Promise<void>) {
  const clock = new FakeClock();
  const outbox = new InMemoryOutboxRepository(new InMemoryStore());
  const subscribers = new EventSubscribers();
  subscribers.register({ name: 'test', events: 'all', handle });
  const config = testConfig();
  const dispatcher = new OutboxDispatcher(outbox, subscribers, clock, config);
  return { clock, outbox, dispatcher, config };
}

async function appendEvent(outbox: InMemoryOutboxRepository, clock: FakeClock): Promise<void> {
  await outbox.append([
    createDomainEvent({
      name: 'SeatsHeld',
      aggregateId: 'hold-1',
      ticketedEventId: 'event-1',
      occurredAt: clock.now(),
      payload: { seatIds: ['A-1-1'] },
    }),
  ]);
}

describe('OutboxDispatcher', () => {
  it('delivers pending messages once and marks them published', async () => {
    const handle = jest.fn(() => Promise.resolve());
    const { clock, outbox, dispatcher } = setup(handle);
    await appendEvent(outbox, clock);

    expect(await dispatcher.dispatchPending()).toEqual({ published: 1, failed: 0, dead: 0 });
    expect(await dispatcher.dispatchPending()).toEqual({ published: 0, failed: 0, dead: 0 });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(outbox.records()[0]?.publishedAt).not.toBeNull();
  });

  it('backs off exponentially and dead-letters after the last attempt', async () => {
    const handle = jest.fn(() => Promise.reject(new Error('broker down')));
    const { clock, outbox, dispatcher, config } = setup(handle);
    await appendEvent(outbox, clock);

    expect(await dispatcher.dispatchPending()).toMatchObject({ failed: 1, dead: 0 });
    expect(await dispatcher.dispatchPending()).toMatchObject({ failed: 0 });

    clock.advanceSeconds(retryDelayMs(1, config.outbox.retryBaseDelayMs) / 1000);
    expect(await dispatcher.dispatchPending()).toMatchObject({ failed: 1, dead: 0 });

    clock.advanceSeconds(retryDelayMs(2, config.outbox.retryBaseDelayMs) / 1000);
    expect(await dispatcher.dispatchPending()).toMatchObject({ failed: 1, dead: 1 });

    const [record] = outbox.records();
    expect(record).toMatchObject({ attempts: config.outbox.maxAttempts, lastError: 'Error: broker down' });
    expect(record?.deadAt).not.toBeNull();
    clock.advanceSeconds(3600);
    expect(await dispatcher.dispatchPending()).toMatchObject({ published: 0, failed: 0 });
  });

  it('caps the retry delay', () => {
    expect(retryDelayMs(1, 500)).toBe(500);
    expect(retryDelayMs(3, 500)).toBe(2_000);
    expect(retryDelayMs(50, 500)).toBe(5 * 60_000);
  });
});
