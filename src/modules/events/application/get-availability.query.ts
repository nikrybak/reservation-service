import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/application/clock';
import { EventNotFoundError } from '../domain/errors';
import { type AvailabilitySnapshot, buildAvailabilitySnapshot } from './availability';
import { AvailabilityCache } from './availability-cache';
import {
  SEAT_REPOSITORY,
  type SeatRepository,
  TICKETED_EVENT_REPOSITORY,
  type TicketedEventRepository,
} from './ports';

export interface AvailabilityResult {
  readonly snapshot: AvailabilitySnapshot;
  readonly cacheHit: boolean;
}

@Injectable()
export class GetAvailabilityQuery {
  constructor(
    private readonly cache: AvailabilityCache,
    @Inject(TICKETED_EVENT_REPOSITORY) private readonly events: TicketedEventRepository,
    @Inject(SEAT_REPOSITORY) private readonly seats: SeatRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(ticketedEventId: string): Promise<AvailabilityResult> {
    const cached = this.cache.get(ticketedEventId);
    if (cached) {
      return { snapshot: cached, cacheHit: true };
    }

    const ticket = this.cache.ticket(ticketedEventId);
    const event = await this.events.findById(ticketedEventId);
    if (!event) {
      throw new EventNotFoundError(ticketedEventId);
    }
    const seats = await this.seats.findByEvent(ticketedEventId);
    const snapshot = buildAvailabilitySnapshot(event, seats, this.clock.now());
    this.cache.set(snapshot, ticket);
    return { snapshot, cacheHit: false };
  }
}
