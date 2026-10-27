import type { AppConfig } from '../../src/shared/config/app-config';

export const ADMIN_KEY = 'test-admin-key-0000000001';
export const CLIENT_KEY = 'test-client-key-000000001';
export const OTHER_CLIENT_KEY = 'test-client-key-000000002';

export function testConfig(overrides: Partial<AppConfig['holds']> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    logLevel: 'silent',
    persistence: { driver: 'memory' },
    apiKeys: [
      { key: ADMIN_KEY, role: 'admin', principalId: 'ops' },
      { key: CLIENT_KEY, role: 'client', principalId: 'shop-a' },
      { key: OTHER_CLIENT_KEY, role: 'client', principalId: 'shop-b' },
    ],
    holds: {
      defaultTtlSeconds: 300,
      maxTtlSeconds: 900,
      maxSeats: 4,
      sweepIntervalMs: 0,
      sweepBatchSize: 100,
      ...overrides,
    },
    outbox: {
      pollIntervalMs: 0,
      batchSize: 50,
      maxAttempts: 3,
      retryBaseDelayMs: 1000,
      leaseMs: 30_000,
    },
  };
}

/** Two sections: A has 2 VIP rows of 4, B has 1 standard row of 10. */
export function eventRequest(startsAt = '2030-06-01T19:00:00.000Z') {
  return {
    name: 'Autumn Symphony',
    venue: 'City Concert Hall',
    startsAt,
    currency: 'EUR',
    pricingTiers: [
      { code: 'VIP', name: 'VIP', priceMinor: 12_500 },
      { code: 'STD', name: 'Standard', priceMinor: 4_900 },
    ],
    sections: [
      {
        name: 'A',
        rows: [
          { name: '1', tier: 'VIP', seatCount: 4 },
          { name: '2', tier: 'VIP', seatCount: 4 },
        ],
      },
      { name: 'B', rows: [{ name: '1', tier: 'STD', seatCount: 10 }] },
    ],
  };
}
