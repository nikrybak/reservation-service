import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/application/clock';
import { UnitOfWork } from '../../../shared/application/unit-of-work';
import {
  type CreateTicketedEventInput,
  TicketedEvent,
} from '../domain/ticketed-event';
import {
  SEAT_REPOSITORY,
  type SeatRepository,
  TICKETED_EVENT_REPOSITORY,
  type TicketedEventRepository,
} from './ports';

export type CreateEventCommand = Omit<CreateTicketedEventInput, 'id'>;

export interface CreatedEvent {
  readonly event: TicketedEvent;
  readonly seatCount: number;
}

@Injectable()
export class CreateEventUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    @Inject(TICKETED_EVENT_REPOSITORY) private readonly events: TicketedEventRepository,
    @Inject(SEAT_REPOSITORY) private readonly seats: SeatRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateEventCommand): Promise<CreatedEvent> {
    const { event, seats } = TicketedEvent.create({ ...command, id: randomUUID() }, this.clock.now());
    await this.unitOfWork.execute(async () => {
      await this.events.insert(event);
      await this.seats.insertMany(seats);
    });
    return { event, seatCount: seats.length };
  }
}
