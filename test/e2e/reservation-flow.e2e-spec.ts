import { ADMIN_KEY, CLIENT_KEY, OTHER_CLIENT_KEY } from '../support/fixtures';
import { confirmHold, createTestApp, placeHold, type TestApp } from '../support/test-app';

interface HoldBody {
  id: string;
  status: string;
  seatIds: string[];
  total: { amountMinor: number; currency: string };
  expiresAt: string;
}

interface BookingBody {
  id: string;
  holdId: string;
  status: string;
  total: { amountMinor: number; currency: string };
}

interface AvailabilityBody {
  totals: { available: number; held: number; booked: number };
  tiers: Array<{ code: string; available: number; total: number }>;
  sections: Array<{ name: string; rows: Array<{ seats: Array<{ id: string; status: string }> }> }>;
}

function seatStatus(body: AvailabilityBody, seatId: string): string | undefined {
  return body.sections
    .flatMap((section) => section.rows.flatMap((row) => row.seats))
    .find((seat) => seat.id === seatId)?.status;
}

describe('Reservation flow (e2e)', () => {
  let t: TestApp;
  let eventId: string;

  beforeEach(async () => {
    t = await createTestApp();
    eventId = await t.createEvent();
  });

  afterEach(async () => {
    await t.close();
  });

  const availability = async () => {
    const response = await t
      .http()
      .get(`/events/${eventId}/availability`)
      .set('x-api-key', CLIENT_KEY)
      .expect(200);
    return { body: response.body as AvailabilityBody, cache: response.headers['x-cache'] };
  };

  it('holds, confirms and books seats, invalidating the availability cache on each change', async () => {
    const initial = await availability();
    expect(initial.cache).toBe('miss');
    expect(initial.body.totals).toEqual({ available: 18, held: 0, booked: 0 });
    expect((await availability()).cache).toBe('hit');

    const held = await placeHold(t, eventId, ['A-1-1', 'B-1-3']).expect(201);
    const hold = held.body as HoldBody;
    expect(hold).toMatchObject({
      status: 'active',
      seatIds: ['A-1-1', 'B-1-3'],
      total: { amountMinor: 17_400, currency: 'EUR' },
    });

    const afterHold = await availability();
    expect(afterHold.cache).toBe('miss');
    expect(afterHold.body.totals).toEqual({ available: 16, held: 2, booked: 0 });
    expect(afterHold.body.tiers.find((tier) => tier.code === 'VIP')).toMatchObject({ available: 7, total: 8 });

    const confirmed = await confirmHold(t, hold.id, 'order-1001').expect(201);
    const booking = confirmed.body as BookingBody;
    expect(confirmed.headers['idempotent-replayed']).toBe('false');
    expect(booking).toMatchObject({ holdId: hold.id, status: 'confirmed', total: { amountMinor: 17_400 } });

    const fetched = await t.http().get(`/bookings/${booking.id}`).set('x-api-key', CLIENT_KEY).expect(200);
    expect(fetched.body).toEqual(booking);

    const afterBooking = await availability();
    expect(afterBooking.body.totals).toEqual({ available: 16, held: 0, booked: 2 });
    expect(seatStatus(afterBooking.body, 'B-1-3')).toBe('booked');

    const report = await t.dispatchOutbox();
    expect(report).toEqual({ published: 2, failed: 0, dead: 0 });
    expect(t.outbox.records().map((record) => record.name)).toEqual(['SeatsHeld', 'BookingConfirmed']);
  });

  it('replays an idempotent confirmation instead of booking twice', async () => {
    const hold = (await placeHold(t, eventId, ['A-2-1']).expect(201)).body as HoldBody;

    const first = await confirmHold(t, hold.id, 'order-2001').expect(201);
    const second = await confirmHold(t, hold.id, 'order-2001').expect(200);

    expect(second.headers['idempotent-replayed']).toBe('true');
    expect((second.body as BookingBody).id).toBe((first.body as BookingBody).id);

    const otherKey = await confirmHold(t, hold.id, 'order-2002').expect(409);
    expect(otherKey.body).toMatchObject({ code: 'hold_not_active' });

    const otherHold = (await placeHold(t, eventId, ['A-2-2']).expect(201)).body as HoldBody;
    const reused = await confirmHold(t, otherHold.id, 'order-2001').expect(422);
    expect(reused.body).toMatchObject({ code: 'idempotency_key_reused' });
  });

  it('lets only one of several concurrent holds on the same seat succeed', async () => {
    const contenders = [CLIENT_KEY, OTHER_CLIENT_KEY, CLIENT_KEY, OTHER_CLIENT_KEY, CLIENT_KEY];

    const responses = await Promise.all(contenders.map((key) => placeHold(t, eventId, ['A-1-4'], key)));

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    responses
      .filter((response) => response.status === 409)
      .forEach((response) => expect(response.body).toMatchObject({ code: 'seats_unavailable' }));
    expect((await availability()).body.totals.held).toBe(1);
  });

  it('expires holds: confirmation fails after the deadline and the sweep returns seats to the pool', async () => {
    const hold = (await placeHold(t, eventId, ['B-1-1', 'B-1-2'], CLIENT_KEY, 60).expect(201)).body as HoldBody;
    t.clock.advanceSeconds(61);

    const late = await confirmHold(t, hold.id, 'order-3001').expect(410);
    expect(late.body).toMatchObject({ code: 'hold_expired', status: 410 });

    await t.sweepHolds();

    const after = await availability();
    expect(seatStatus(after.body, 'B-1-1')).toBe('available');
    expect(after.body.totals.held).toBe(0);
    await placeHold(t, eventId, ['B-1-1'], OTHER_CLIENT_KEY).expect(201);
    expect(t.outbox.records().map((record) => record.name)).toEqual(['SeatsHeld', 'HoldExpired', 'SeatsHeld']);
  });

  it('lets a new customer take over a lapsed hold before the sweep runs', async () => {
    await placeHold(t, eventId, ['B-1-5'], CLIENT_KEY, 60).expect(201);
    t.clock.advanceSeconds(60);

    await placeHold(t, eventId, ['B-1-5'], OTHER_CLIENT_KEY).expect(201);
    await t.sweepHolds();

    expect(seatStatus((await availability()).body, 'B-1-5')).toBe('held');
  });

  it('releases a hold on request and hides it from other clients', async () => {
    const hold = (await placeHold(t, eventId, ['A-1-2']).expect(201)).body as HoldBody;

    await t.http().delete(`/holds/${hold.id}`).set('x-api-key', OTHER_CLIENT_KEY).expect(404);
    await t.http().delete(`/holds/${hold.id}`).set('x-api-key', CLIENT_KEY).expect(204);
    await t.http().delete(`/holds/${hold.id}`).set('x-api-key', CLIENT_KEY).expect(409);

    expect(seatStatus((await availability()).body, 'A-1-2')).toBe('available');
  });

  it('cancels a booking (admin only) and frees its seats', async () => {
    const hold = (await placeHold(t, eventId, ['A-1-3']).expect(201)).body as HoldBody;
    const booking = (await confirmHold(t, hold.id, 'order-4001').expect(201)).body as BookingBody;

    await t.http().post(`/bookings/${booking.id}/cancel`).set('x-api-key', CLIENT_KEY).send({}).expect(403);
    const cancelled = await t
      .http()
      .post(`/bookings/${booking.id}/cancel`)
      .set('x-api-key', ADMIN_KEY)
      .send({ reason: 'venue change' })
      .expect(200);
    expect(cancelled.body).toMatchObject({ status: 'cancelled' });

    await t.http().post(`/bookings/${booking.id}/cancel`).set('x-api-key', ADMIN_KEY).send({}).expect(409);
    expect(seatStatus((await availability()).body, 'A-1-3')).toBe('available');
    await t.http().get(`/bookings/${booking.id}`).set('x-api-key', OTHER_CLIENT_KEY).expect(404);
  });
});
