import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

export const ROLES = ['admin', 'client'] as const;
export type Role = (typeof ROLES)[number];

const MIN_API_KEY_LENGTH = 16;
const MAX_PORT = 65_535;

const apiKeyEntry = z
  .string()
  .trim()
  .transform((entry, ctx) => {
    const [key, role, principalId] = entry.split(':');
    const parsed = z
      .object({
        key: z.string().min(MIN_API_KEY_LENGTH),
        role: z.enum(ROLES),
        principalId: z.string().min(1),
      })
      .safeParse({ key, role, principalId });
    if (!parsed.success) {
      ctx.addIssue({
        code: 'custom',
        message: 'API_KEYS entries must look like key:role:principalId',
      });
      return z.NEVER;
    }
    return parsed.data;
  });

const intFromEnv = (fallback: number, min = 0) =>
  z.coerce.number().int().min(min).default(fallback);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: intFromEnv(3000, 1).pipe(z.number().max(MAX_PORT)),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    PERSISTENCE_DRIVER: z.enum(['memory', 'postgres']).default('postgres'),
    DATABASE_URL: z.url().optional(),
    API_KEYS: z
      .string()
      .min(1)
      .transform((raw) => raw.split(',').filter((entry) => entry.trim().length > 0))
      .pipe(z.array(apiKeyEntry).min(1)),
    HOLD_DEFAULT_TTL_SECONDS: intFromEnv(600, 1),
    HOLD_MAX_TTL_SECONDS: intFromEnv(1800, 1),
    HOLD_MAX_SEATS: intFromEnv(10, 1),
    HOLD_SWEEP_INTERVAL_MS: intFromEnv(5000),
    HOLD_SWEEP_BATCH_SIZE: intFromEnv(200, 1),
    OUTBOX_POLL_INTERVAL_MS: intFromEnv(1000),
    OUTBOX_BATCH_SIZE: intFromEnv(100, 1),
    OUTBOX_MAX_ATTEMPTS: intFromEnv(8, 1),
    OUTBOX_RETRY_BASE_DELAY_MS: intFromEnv(500, 1),
    OUTBOX_LEASE_MS: intFromEnv(30_000, 1),
  })
  .superRefine((env, ctx) => {
    if (env.PERSISTENCE_DRIVER === 'postgres' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required for the postgres driver',
      });
    }
  });

export interface ApiKeyEntry {
  readonly key: string;
  readonly role: Role;
  readonly principalId: string;
}

export type PersistenceConfig =
  { readonly driver: 'memory' } | { readonly driver: 'postgres'; readonly databaseUrl: string };

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly logLevel: string;
  readonly persistence: PersistenceConfig;
  readonly apiKeys: readonly ApiKeyEntry[];
  readonly holds: {
    readonly defaultTtlSeconds: number;
    readonly maxTtlSeconds: number;
    readonly maxSeats: number;
    /** 0 disables the scheduled sweep; tests drive expiry explicitly. */
    readonly sweepIntervalMs: number;
    readonly sweepBatchSize: number;
  };
  readonly outbox: {
    /** 0 disables background dispatch. */
    readonly pollIntervalMs: number;
    readonly batchSize: number;
    readonly maxAttempts: number;
    readonly retryBaseDelayMs: number;
    readonly leaseMs: number;
  };
}

export class InvalidConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = InvalidConfigError.name;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new InvalidConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }
  const parsed = result.data;
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    persistence:
      parsed.PERSISTENCE_DRIVER === 'postgres' && parsed.DATABASE_URL
        ? { driver: 'postgres', databaseUrl: parsed.DATABASE_URL }
        : { driver: 'memory' },
    apiKeys: parsed.API_KEYS,
    holds: {
      defaultTtlSeconds: parsed.HOLD_DEFAULT_TTL_SECONDS,
      maxTtlSeconds: parsed.HOLD_MAX_TTL_SECONDS,
      maxSeats: parsed.HOLD_MAX_SEATS,
      sweepIntervalMs: parsed.HOLD_SWEEP_INTERVAL_MS,
      sweepBatchSize: parsed.HOLD_SWEEP_BATCH_SIZE,
    },
    outbox: {
      pollIntervalMs: parsed.OUTBOX_POLL_INTERVAL_MS,
      batchSize: parsed.OUTBOX_BATCH_SIZE,
      maxAttempts: parsed.OUTBOX_MAX_ATTEMPTS,
      retryBaseDelayMs: parsed.OUTBOX_RETRY_BASE_DELAY_MS,
      leaseMs: parsed.OUTBOX_LEASE_MS,
    },
  };
}
