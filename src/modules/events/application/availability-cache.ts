import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CommittedEventsBus } from '../../../shared/application/committed-events.bus';
import type { AvailabilitySnapshot } from './availability';

const MAX_CACHED_EVENTS = 1_000;

/** Opaque token proving which generation of an entry a reader started from. */
export type CacheTicket = number;

/**
 * Snapshot cache invalidated by committed domain events rather than by TTL: seat maps are
 * read far more often than they change, and every change already emits an event.
 */
@Injectable()
export class AvailabilityCache implements OnModuleInit {
  private readonly entries = new Map<string, AvailabilitySnapshot>();
  private readonly generations = new Map<string, number>();

  constructor(private readonly committedEvents: CommittedEventsBus) {}

  onModuleInit(): void {
    this.committedEvents.subscribe((events) => {
      new Set(events.map((event) => event.ticketedEventId)).forEach((id) => this.invalidate(id));
    });
  }

  get(ticketedEventId: string): AvailabilitySnapshot | undefined {
    return this.entries.get(ticketedEventId);
  }

  ticket(ticketedEventId: string): CacheTicket {
    return this.generations.get(ticketedEventId) ?? 0;
  }

  /**
   * Stores a snapshot only if nothing was invalidated since the reader took its ticket.
   * Without this, a slow reader could overwrite a fresh invalidation with stale data.
   */
  set(snapshot: AvailabilitySnapshot, ticket: CacheTicket): void {
    if (this.ticket(snapshot.ticketedEventId) !== ticket) {
      return;
    }
    if (this.entries.size >= MAX_CACHED_EVENTS && !this.entries.has(snapshot.ticketedEventId)) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(snapshot.ticketedEventId, snapshot);
  }

  invalidate(ticketedEventId: string): void {
    this.generations.set(ticketedEventId, this.ticket(ticketedEventId) + 1);
    this.entries.delete(ticketedEventId);
  }
}
