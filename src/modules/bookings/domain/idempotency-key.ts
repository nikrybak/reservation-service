import { InvalidIdempotencyKeyError } from './errors';

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export class IdempotencyKey {
  private constructor(readonly value: string) {}

  static parse(raw: string): IdempotencyKey {
    if (!IDEMPOTENCY_KEY_PATTERN.test(raw)) {
      throw new InvalidIdempotencyKeyError(
        'Idempotency key must be 8-128 characters of letters, digits, "-" or "_"',
      );
    }
    return new IdempotencyKey(raw);
  }

  toString(): string {
    return this.value;
  }
}
