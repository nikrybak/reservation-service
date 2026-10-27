import { Money } from '../../../src/shared/domain/money';
import { Booking } from '../../../src/modules/bookings/domain/booking';
import { BookingAlreadyCancelledError } from '../../../src/modules/bookings/domain/errors';
import { IdempotencyKey } from '../../../src/modules/bookings/domain/idempotency-key';
import {
  HoldExpiredError,
  HoldNotActiveError,
  InvalidHoldError,
} from '../../../src/modules/holds/domain/errors';
import { type HeldSeat, Hold } from '../../../src/modules/holds/domain/hold';
import { HoldPolicy, MIN_HOLD_TTL_SECONDS } from '../../../src/modules/holds/domain/hold-policy';

const NOW = new Date('2030-01-01T10:00:00Z');
const policy = new HoldPolicy(3, 300, 900);

function seat(seatId: string, priceMinor = 5_000): HeldSeat {
  return { seatId, tierCode: 'STD', price: Money.of(priceMinor, 'EUR') };
}

function placeHold(seats: HeldSeat[] = [seat('A-1-1'), seat('A-1-2', 7_500)], ttlSeconds?: number) {
  return Hold.place(
    {
      id: 'hold-1',
      ticketedEventId: 'event-1',
      holderId: 'shop-a',
      currency: 'EUR',
      seats,
      now: NOW,
      ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
    },
    policy,
  );
}

const after = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe('Hold', () => {
  it('totals seat prices and applies the default TTL', () => {
    const hold = placeHold();

    expect(hold.total.amountMinor).toBe(12_500);
    expect(hold.expiresAt).toEqual(after(300));
    expect(hold.pullEvents()).toEqual([
      expect.objectContaining({
        name: 'SeatsHeld',
        aggregateId: 'hold-1',
        ticketedEventId: 'event-1',
        payload: expect.objectContaining({ seatIds: ['A-1-1', 'A-1-2'], totalMinor: 12_500 }),
      }),
    ]);
  });

  it('enforces the seat limit and rejects duplicates', () => {
    expect(() => placeHold([seat('A-1-1'), seat('A-1-2'), seat('A-1-3'), seat('A-1-4')])).toThrow(
      InvalidHoldError,
    );
    expect(() => placeHold([seat('A-1-1'), seat('A-1-1')])).toThrow(/same seat twice/);
  });

  it.each([MIN_HOLD_TTL_SECONDS - 1, 901, 12.5])('rejects a TTL of %p seconds', (ttl) => {
    expect(() => placeHold(undefined, ttl)).toThrow(InvalidHoldError);
  });

  it('confirms only while active and unexpired', () => {
    const hold = placeHold();
    hold.confirm(after(299));
    expect(hold.status).toBe('confirmed');
    expect(() => hold.confirm(after(299))).toThrow(HoldNotActiveError);
  });

  it('refuses confirmation at or after the deadline', () => {
    expect(() => placeHold().confirm(after(300))).toThrow(HoldExpiredError);
  });

  it('expires only after its deadline and records HoldExpired', () => {
    const hold = placeHold();
    hold.pullEvents();

    expect(() => hold.expire(after(10))).toThrow(InvalidHoldError);
    hold.expire(after(300));

    expect(hold.status).toBe('expired');
    expect(hold.pullEvents().map((event) => event.name)).toEqual(['HoldExpired']);
  });

  it('can be released once', () => {
    const hold = placeHold();
    hold.release(NOW);
    expect(() => hold.release(NOW)).toThrow(HoldNotActiveError);
  });
});

describe('Booking', () => {
  function confirmBooking(): Booking {
    return Booking.confirm({
      id: 'booking-1',
      holdId: 'hold-1',
      ticketedEventId: 'event-1',
      holderId: 'shop-a',
      idempotencyKey: IdempotencyKey.parse('key-00000001'),
      seats: [seat('A-1-1')],
      total: Money.of(5_000, 'EUR'),
      now: NOW,
    });
  }

  it('records BookingConfirmed on creation', () => {
    expect(
      confirmBooking()
        .pullEvents()
        .map((event) => event.name),
    ).toEqual(['BookingConfirmed']);
  });

  it('cancels once and records the reason', () => {
    const booking = confirmBooking();
    booking.pullEvents();
    booking.cancel(after(60), 'customer request');

    expect(booking.snapshot().cancelledAt).toEqual(after(60));
    expect(booking.pullEvents()[0]?.payload).toMatchObject({ reason: 'customer request' });
    expect(() => booking.cancel(after(61), null)).toThrow(BookingAlreadyCancelledError);
  });
});
