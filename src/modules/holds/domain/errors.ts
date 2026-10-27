import { DomainError } from '../../../shared/domain/domain-error';

export class HoldNotFoundError extends DomainError {
  readonly code = 'hold_not_found';
  readonly kind = 'not_found';

  constructor(holdId: string) {
    super(`Hold ${holdId} does not exist`, { holdId });
  }
}

export class HoldExpiredError extends DomainError {
  readonly code = 'hold_expired';
  readonly kind = 'gone';

  constructor(holdId: string, expiresAt: Date) {
    super(`Hold ${holdId} expired at ${expiresAt.toISOString()}`, {
      holdId,
      expiresAt: expiresAt.toISOString(),
    });
  }
}

export class HoldNotActiveError extends DomainError {
  readonly code = 'hold_not_active';
  readonly kind = 'conflict';

  constructor(holdId: string, status: string) {
    super(`Hold ${holdId} is ${status}`, { holdId, status });
  }
}

export class InvalidHoldError extends DomainError {
  readonly code = 'invalid_hold';
  readonly kind = 'validation';
}
