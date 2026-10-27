import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/shared/application/clock';
import { OUTBOX_REPOSITORY } from '../../src/shared/application/outbox.repository';
import type { InMemoryOutboxRepository } from '../../src/shared/outbox/infrastructure/in-memory-outbox.repository';
import { HoldExpiryScheduler } from '../../src/modules/holds/infrastructure/hold-expiry.scheduler';
import { OutboxDispatcher } from '../../src/shared/outbox/application/outbox-dispatcher';
import { FakeClock } from './fake-clock';
import { ADMIN_KEY, CLIENT_KEY, eventRequest, testConfig } from './fixtures';

export interface TestApp {
  readonly app: INestApplication<App>;
  readonly clock: FakeClock;
  readonly http: () => ReturnType<typeof request>;
  readonly sweepHolds: () => Promise<void>;
  readonly dispatchOutbox: OutboxDispatcher['dispatchPending'];
  readonly outbox: InMemoryOutboxRepository;
  readonly createEvent: () => Promise<string>;
  readonly close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const clock = new FakeClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(testConfig())] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  // A real listening socket makes concurrent supertest calls share one server.
  await app.listen(0, '127.0.0.1');

  const scheduler = app.get(HoldExpiryScheduler);
  const dispatcher = app.get(OutboxDispatcher);
  const http = () => request(app.getHttpServer());

  return {
    app,
    clock,
    http,
    sweepHolds: () => scheduler.tick(),
    dispatchOutbox: () => dispatcher.dispatchPending(),
    outbox: app.get<InMemoryOutboxRepository>(OUTBOX_REPOSITORY),
    createEvent: async () => {
      const response = await http()
        .post('/events')
        .set('x-api-key', ADMIN_KEY)
        .send(eventRequest())
        .expect(201);
      return (response.body as { id: string }).id;
    },
    close: () => app.close(),
  };
}

export function placeHold(
  testApp: TestApp,
  eventId: string,
  seatIds: string[],
  apiKey = CLIENT_KEY,
  ttlSeconds?: number,
) {
  return testApp
    .http()
    .post(`/events/${eventId}/holds`)
    .set('x-api-key', apiKey)
    .send(ttlSeconds === undefined ? { seatIds } : { seatIds, ttlSeconds });
}

export function confirmHold(testApp: TestApp, holdId: string, idempotencyKey: string, apiKey = CLIENT_KEY) {
  return testApp
    .http()
    .post(`/holds/${holdId}/confirm`)
    .set('x-api-key', apiKey)
    .set('Idempotency-Key', idempotencyKey);
}
