import { InvalidHoldError } from './errors';

export const MIN_HOLD_TTL_SECONDS = 30;

/** Business limits for holds; values come from configuration so operators can tune them. */
export class HoldPolicy {
  constructor(
    readonly maxSeats: number,
    readonly defaultTtlSeconds: number,
    readonly maxTtlSeconds: number,
  ) {
    if (defaultTtlSeconds < MIN_HOLD_TTL_SECONDS || defaultTtlSeconds > maxTtlSeconds) {
      throw new InvalidHoldError('Default hold TTL must lie within the allowed bounds');
    }
  }

  resolveTtlSeconds(requested: number | undefined): number {
    const ttl = requested ?? this.defaultTtlSeconds;
    if (!Number.isInteger(ttl) || ttl < MIN_HOLD_TTL_SECONDS || ttl > this.maxTtlSeconds) {
      throw new InvalidHoldError(
        `Hold TTL must be between ${MIN_HOLD_TTL_SECONDS} and ${this.maxTtlSeconds} seconds`,
        { ttlSeconds: ttl },
      );
    }
    return ttl;
  }

  assertSeatCount(count: number): void {
    if (count < 1 || count > this.maxSeats) {
      throw new InvalidHoldError(`A hold covers between 1 and ${this.maxSeats} seats`, { count });
    }
  }
}
