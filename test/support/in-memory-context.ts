import { CommittedEventsBus } from '../../src/shared/application/committed-events.bus';
import { UnitOfWork } from '../../src/shared/application/unit-of-work';
import { InMemoryStore } from '../../src/shared/persistence/in-memory/in-memory-store';
import { InMemoryOutboxRepository } from '../../src/shared/outbox/infrastructure/in-memory-outbox.repository';
import { CreateEventUseCase } from '../../src/modules/events/application/create-event.use-case';
import { SeatInventory } from '../../src/modules/events/application/seat-inventory.service';
import {
  InMemorySeatRepository,
  InMemoryTicketedEventRepository,
} from '../../src/modules/events/infrastructure/in-memory-events.repositories';
import { InMemoryHoldRepository } from '../../src/modules/holds/infrastructure/in-memory-hold.repository';
import { InMemoryBookingRepository } from '../../src/modules/bookings/infrastructure/in-memory-booking.repository';
import { PlaceHoldUseCase } from '../../src/modules/holds/application/place-hold.use-case';
import { ConfirmHoldUseCase } from '../../src/modules/bookings/application/confirm-hold.use-case';
import { HoldPolicy } from '../../src/modules/holds/domain/hold-policy';
import { FakeClock } from './fake-clock';

/** Wires use cases by hand against the in-memory adapters, without a Nest container. */
export function createInMemoryContext() {
  const clock = new FakeClock();
  const store = new InMemoryStore();
  const outbox = new InMemoryOutboxRepository(store);
  const committedEvents = new CommittedEventsBus();
  const unitOfWork = new UnitOfWork(store, outbox, committedEvents);
  const events = new InMemoryTicketedEventRepository(store);
  const seats = new InMemorySeatRepository(store);
  const holds = new InMemoryHoldRepository(store);
  const bookings = new InMemoryBookingRepository(store);
  const inventory = new SeatInventory(seats);
  const policy = new HoldPolicy(4, 300, 900);

  return {
    clock,
    store,
    outbox,
    committedEvents,
    seats,
    holds,
    bookings,
    createEvent: new CreateEventUseCase(unitOfWork, events, seats, clock),
    placeHold: new PlaceHoldUseCase(unitOfWork, inventory, events, holds, policy, clock),
    confirmHold: new ConfirmHoldUseCase(unitOfWork, inventory, holds, bookings, clock),
  };
}

export async function seedEvent(context: ReturnType<typeof createInMemoryContext>) {
  const { event } = await context.createEvent.execute({
    name: 'Test Event',
    venue: 'Test Hall',
    startsAt: new Date('2030-06-01T19:00:00.000Z'),
    currency: 'EUR',
    pricingTiers: [{ code: 'STD', name: 'Standard', priceMinor: 5_000 }],
    sections: [{ name: 'A', rows: [{ name: '1', tierCode: 'STD', seatCount: 5 }] }],
  });
  return event;
}
