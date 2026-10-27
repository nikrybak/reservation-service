import {
  EventClosedForSalesError,
  InvalidSeatMapError,
  SeatsUnavailableError,
} from '../../../src/modules/events/domain/errors';
import { MAX_SEATS_PER_ROW } from '../../../src/modules/events/domain/limits';
import { Seat } from '../../../src/modules/events/domain/seat';
import { SeatId } from '../../../src/modules/events/domain/seat-id';
import {
  type CreateTicketedEventInput,
  TicketedEvent,
} from '../../../src/modules/events/domain/ticketed-event';

const NOW = new Date('2030-01-01T00:00:00Z');

function input(overrides: Partial<CreateTicketedEventInput> = {}): CreateTicketedEventInput {
  return {
    id: 'event-1',
    name: ' Gala ',
    venue: 'Hall',
    startsAt: new Date('2030-02-01T19:00:00Z'),
    currency: 'EUR',
    pricingTiers: [
      { code: 'VIP', name: 'VIP', priceMinor: 10_000 },
      { code: 'STD', name: 'Standard', priceMinor: 3_000 },
    ],
    sections: [
      {
        name: 'A',
        rows: [
          { name: '1', tierCode: 'VIP', seatCount: 2 },
          { name: '2', tierCode: 'STD', seatCount: 3 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('TicketedEvent.create', () => {
  it('generates one seat per position with the row tier', () => {
    const { event, seats } = TicketedEvent.create(input(), NOW);

    expect(event.snapshot().name).toBe('Gala');
    expect(seats.map((seat) => seat.id.toString())).toEqual([
      'A-1-1',
      'A-1-2',
      'A-2-1',
      'A-2-2',
      'A-2-3',
    ]);
    expect(seats.map((seat) => seat.tierCode)).toEqual(['VIP', 'VIP', 'STD', 'STD', 'STD']);
    expect(seats.every((seat) => seat.status === 'available')).toBe(true);
    expect(event.priceOf('VIP').amountMinor).toBe(10_000);
  });

  it('rejects events in the past', () => {
    expect(() => TicketedEvent.create(input({ startsAt: NOW }), NOW)).toThrow(InvalidSeatMapError);
  });

  it('rejects duplicate tier codes', () => {
    const pricingTiers = [
      { code: 'STD', name: 'One', priceMinor: 1 },
      { code: 'STD', name: 'Two', priceMinor: 2 },
    ];
    expect(() => TicketedEvent.create(input({ pricingTiers }), NOW)).toThrow(/unique/);
  });

  it('rejects rows that reference an unknown tier', () => {
    const sections = [{ name: 'A', rows: [{ name: '1', tierCode: 'GOLD', seatCount: 1 }] }];
    expect(() => TicketedEvent.create(input({ sections }), NOW)).toThrow(/unknown pricing tier/);
  });

  it('rejects duplicate row names within a section', () => {
    const sections = [
      {
        name: 'A',
        rows: [
          { name: '1', tierCode: 'STD', seatCount: 1 },
          { name: '1', tierCode: 'STD', seatCount: 1 },
        ],
      },
    ];
    expect(() => TicketedEvent.create(input({ sections }), NOW)).toThrow(InvalidSeatMapError);
  });

  it('rejects rows above the seat limit', () => {
    const sections = [
      { name: 'A', rows: [{ name: '1', tierCode: 'STD', seatCount: MAX_SEATS_PER_ROW + 1 }] },
    ];
    expect(() => TicketedEvent.create(input({ sections }), NOW)).toThrow(InvalidSeatMapError);
  });

  it('closes sales once the event has started', () => {
    const { event } = TicketedEvent.create(input(), NOW);
    expect(() => event.assertOpenForSales(new Date('2030-02-01T19:00:00Z'))).toThrow(
      EventClosedForSalesError,
    );
  });
});

describe('Seat', () => {
  const until = new Date('2030-01-01T00:10:00Z');

  it('can be held, booked and released again', () => {
    const seat = Seat.create('event-1', SeatId.parse('A-1-1'), 'STD');
    seat.hold('hold-1', until, NOW);
    seat.book('hold-1', 'booking-1');
    expect(seat.status).toBe('booked');
    expect(seat.releaseBooking('booking-1')).toBe(true);
    expect(seat.status).toBe('available');
  });

  it('rejects a second hold while the first is live', () => {
    const seat = Seat.create('event-1', SeatId.parse('A-1-1'), 'STD');
    seat.hold('hold-1', until, NOW);
    expect(() => seat.hold('hold-2', until, NOW)).toThrow(SeatsUnavailableError);
  });

  it('lets a new hold take over a lapsed one, after which the old hold cannot release it', () => {
    const seat = Seat.create('event-1', SeatId.parse('A-1-1'), 'STD');
    seat.hold('hold-1', until, NOW);
    seat.hold('hold-2', new Date('2030-01-01T00:30:00Z'), until);

    expect(seat.releaseHold('hold-1')).toBe(false);
    expect(seat.snapshot().holdId).toBe('hold-2');
  });

  it('cannot be booked by a hold that does not own it', () => {
    const seat = Seat.create('event-1', SeatId.parse('A-1-1'), 'STD');
    seat.hold('hold-1', until, NOW);
    expect(() => seat.book('hold-2', 'booking-1')).toThrow(SeatsUnavailableError);
  });
});
