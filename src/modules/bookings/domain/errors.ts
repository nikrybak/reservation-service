import { DomainError } from '../../../shared/domain/domain-error';

export class BookingNotFoundError extends DomainError {
  readonly code = 'booking_not_found';
  readonly kind = 'not_found';

  constructor(bookingId: string) {
    super(`Booking ${bookingId} does not exist`, { bookingId });
  }
}

export class BookingAlreadyCancelledError extends DomainError {
  readonly code = 'booking_already_cancelled';
  readonly kind = 'conflict';

  constructor(bookingId: string) {
    super(`Booking ${bookingId} is already cancelled`, { bookingId });
  }
}

export class IdempotencyKeyReusedError extends DomainError {
  readonly code = 'idempotency_key_reused';
  readonly kind = 'validation';

  constructor(key: string) {
    super('Idempotency key was already used for a different hold', { idempotencyKey: key });
  }
}

export class InvalidIdempotencyKeyError extends DomainError {
  readonly code = 'invalid_idempotency_key';
  readonly kind = 'validation';
}
