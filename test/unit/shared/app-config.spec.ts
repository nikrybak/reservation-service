import { InvalidConfigError, loadConfig } from '../../../src/shared/config/app-config';

const base = {
  PERSISTENCE_DRIVER: 'memory',
  API_KEYS: 'admin-key-1234567890:admin:ops,client-key-123456789:client:shop',
};

describe('loadConfig', () => {
  it('parses API keys and applies defaults', () => {
    const config = loadConfig(base);
    expect(config.apiKeys).toEqual([
      { key: 'admin-key-1234567890', role: 'admin', principalId: 'ops' },
      { key: 'client-key-123456789', role: 'client', principalId: 'shop' },
    ]);
    expect(config.persistence).toEqual({ driver: 'memory' });
    expect(config.holds.defaultTtlSeconds).toBe(600);
  });

  it('requires DATABASE_URL for postgres', () => {
    expect(() => loadConfig({ ...base, PERSISTENCE_DRIVER: 'postgres' })).toThrow(/DATABASE_URL/);
  });

  it('rejects short keys and unknown roles with readable issues', () => {
    expect(() => loadConfig({ ...base, API_KEYS: 'short:admin:ops' })).toThrow(InvalidConfigError);
    expect(() => loadConfig({ ...base, API_KEYS: 'long-enough-key-123:root:ops' })).toThrow(
      /key:role:principalId/,
    );
  });

  it('rejects non-numeric limits', () => {
    expect(() => loadConfig({ ...base, HOLD_MAX_SEATS: 'many' })).toThrow(/HOLD_MAX_SEATS/);
  });
});
