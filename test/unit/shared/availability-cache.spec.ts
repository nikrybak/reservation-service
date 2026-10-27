import { AvailabilityCache } from '../../../src/modules/events/application/availability-cache';
import type { AvailabilitySnapshot } from '../../../src/modules/events/application/availability';
import { CommittedEventsBus } from '../../../src/shared/application/committed-events.bus';
import { createDomainEvent } from '../../../src/shared/domain/domain-event';

function snapshot(ticketedEventId: string): AvailabilitySnapshot {
  return {
    ticketedEventId,
    generatedAt: new Date(),
    totals: { available: 1, held: 0, booked: 0 },
    tiers: [],
    sections: [],
  };
}

function setup() {
  const bus = new CommittedEventsBus();
  const cache = new AvailabilityCache(bus);
  cache.onModuleInit();
  return { bus, cache };
}

describe('AvailabilityCache', () => {
  it('drops an entry when a committed event touches its event', () => {
    const { bus, cache } = setup();
    cache.set(snapshot('event-1'), cache.ticket('event-1'));
    cache.set(snapshot('event-2'), cache.ticket('event-2'));

    bus.publish([
      createDomainEvent({
        name: 'SeatsHeld',
        aggregateId: 'hold-1',
        ticketedEventId: 'event-1',
        occurredAt: new Date(),
        payload: {},
      }),
    ]);

    expect(cache.get('event-1')).toBeUndefined();
    expect(cache.get('event-2')).toBeDefined();
  });

  it('refuses a snapshot computed before an invalidation', () => {
    const { cache } = setup();
    const ticket = cache.ticket('event-1');
    cache.invalidate('event-1');

    cache.set(snapshot('event-1'), ticket);

    expect(cache.get('event-1')).toBeUndefined();
  });
});
