import { randomUUID } from 'node:crypto';
import { ADMIN_KEY, CLIENT_KEY, eventRequest } from '../support/fixtures';
import { confirmHold, createTestApp, placeHold, type TestApp } from '../support/test-app';

const PROBLEM_JSON = /application\/problem\+json/;

describe('API contract (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('health', () => {
    it('is public', async () => {
      const response = await t.http().get('/health').expect(200);
      expect(response.body).toEqual({ status: 'ok', persistence: 'memory' });
    });
  });

  describe('authentication and roles', () => {
    it('rejects requests without an API key as problem+json', async () => {
      const response = await t.http().get(`/events/${randomUUID()}/availability`).expect(401);
      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(response.body).toMatchObject({ status: 401, code: 'unauthorized', title: 'Unauthorized' });
    });

    it('rejects unknown API keys', async () => {
      await t.http().get('/bookings/' + randomUUID()).set('x-api-key', 'not-a-real-key-at-all').expect(401);
    });

    it('requires the admin role to create events', async () => {
      const response = await t.http().post('/events').set('x-api-key', CLIENT_KEY).send(eventRequest()).expect(403);
      expect(response.body).toMatchObject({ code: 'forbidden' });
    });
  });

  describe('correlation ids', () => {
    it('echoes a valid incoming id into the response and problem body', async () => {
      const response = await t.http().get('/no-such-route').set('x-correlation-id', 'trace-abc-123').expect(404);
      expect(response.headers['x-correlation-id']).toBe('trace-abc-123');
      expect(response.body).toMatchObject({ code: 'not_found', correlationId: 'trace-abc-123' });
    });

    it('generates one when the incoming id is unusable', async () => {
      const response = await t.http().get('/health').set('x-correlation-id', 'bad id with spaces').expect(200);
      expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('validation', () => {
    it('lists every invalid field of a nested body', async () => {
      const body = {
        ...eventRequest(),
        currency: 'euro',
        sections: [{ name: 'a', rows: [{ name: '1', tier: 'VIP', seatCount: 0 }] }],
      };
      const response = await t.http().post('/events').set('x-api-key', ADMIN_KEY).send(body).expect(400);

      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      const fields = (response.body as { errors: Array<{ field: string }> }).errors.map((error) => error.field);
      expect(fields).toEqual(
        expect.arrayContaining(['currency', 'sections.0.name', 'sections.0.rows.0.seatCount']),
      );
    });

    it('rejects properties that are not part of the contract', async () => {
      const response = await t
        .http()
        .post('/events')
        .set('x-api-key', ADMIN_KEY)
        .send({ ...eventRequest(), discount: 50 })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'request_validation_failed' });
    });

    it('maps domain rule violations to 422', async () => {
      const response = await t
        .http()
        .post('/events')
        .set('x-api-key', ADMIN_KEY)
        .send(eventRequest('2020-01-01T00:00:00.000Z'))
        .expect(422);
      expect(response.body).toMatchObject({ code: 'invalid_seat_map' });
    });

    it('validates path parameters and seat ids', async () => {
      await t.http().get('/events/not-a-uuid/availability').set('x-api-key', CLIENT_KEY).expect(400);
      const eventId = await t.createEvent();
      const response = await placeHold(t, eventId, ['A1']).expect(400);
      expect(response.body).toMatchObject({ errors: [{ field: 'seatIds' }] });
    });

    it('enforces the configured seat limit per hold', async () => {
      const eventId = await t.createEvent();
      const response = await placeHold(t, eventId, ['B-1-1', 'B-1-2', 'B-1-3', 'B-1-4', 'B-1-5']).expect(422);
      expect(response.body).toMatchObject({ code: 'invalid_hold' });
    });

    it('requires a well-formed Idempotency-Key header to confirm', async () => {
      await t.http().post(`/holds/${randomUUID()}/confirm`).set('x-api-key', CLIENT_KEY).expect(400);
      const response = await confirmHold(t, randomUUID(), 'bad key').expect(400);
      expect(response.body).toMatchObject({ errors: [{ field: 'Idempotency-Key' }] });
    });

    it('returns 404 problems for unknown resources', async () => {
      const response = await t.http().get(`/events/${randomUUID()}/availability`).set('x-api-key', CLIENT_KEY).expect(404);
      expect(response.body).toMatchObject({ code: 'event_not_found', type: expect.stringContaining('event_not_found') });
    });
  });
});
