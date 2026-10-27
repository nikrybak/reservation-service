import { randomUUID } from 'node:crypto';

export type DomainEventName =
  | 'SeatsHeld'
  | 'HoldReleased'
  | 'HoldExpired'
  | 'BookingConfirmed'
  | 'BookingCancelled';

export type DomainEventPayload = Readonly<Record<string, unknown>>;

export interface DomainEvent {
  readonly id: string;
  readonly name: DomainEventName;
  readonly aggregateId: string;
  /** The ticketed event whose seat inventory changed; consumers key caches and streams on it. */
  readonly ticketedEventId: string;
  readonly occurredAt: Date;
  readonly payload: DomainEventPayload;
}

export function createDomainEvent(fields: Omit<DomainEvent, 'id'>): DomainEvent {
  return { id: randomUUID(), ...fields };
}
