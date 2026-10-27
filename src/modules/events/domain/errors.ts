import { DomainError } from '../../../shared/domain/domain-error';

export class InvalidSeatMapError extends DomainError {
  readonly code = 'invalid_seat_map';
  readonly kind = 'validation';
}

export class InvalidSeatIdError extends DomainError {
  readonly code = 'invalid_seat_id';
  readonly kind = 'validation';

  constructor(raw: string) {
    super(`"${raw}" is not a valid seat id (expected SECTION-ROW-NUMBER)`, { seatId: raw });
  }
}

export class EventNotFoundError extends DomainError {
  readonly code = 'event_not_found';
  readonly kind = 'not_found';

  constructor(eventId: string) {
    super(`Event ${eventId} does not exist`, { eventId });
  }
}

export class EventClosedForSalesError extends DomainError {
  readonly code = 'event_closed_for_sales';
  readonly kind = 'conflict';

  constructor(eventId: string) {
    super(`Event ${eventId} has already started`, { eventId });
  }
}

export class UnknownSeatsError extends DomainError {
  readonly code = 'unknown_seats';
  readonly kind = 'validation';

  constructor(seatIds: readonly string[]) {
    super('Some seats do not exist in this event', { seatIds });
  }
}

export class SeatsUnavailableError extends DomainError {
  readonly code = 'seats_unavailable';
  readonly kind = 'conflict';

  constructor(seatIds: readonly string[]) {
    super('Some seats are no longer available', { seatIds });
  }
}
