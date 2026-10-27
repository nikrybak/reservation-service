import { Module } from '@nestjs/common';
import { repositoryProvider } from '../../shared/persistence/repository-provider';
import { AvailabilityCache } from './application/availability-cache';
import { CreateEventUseCase } from './application/create-event.use-case';
import { GetAvailabilityQuery } from './application/get-availability.query';
import {
  SEAT_REPOSITORY,
  type SeatRepository,
  TICKETED_EVENT_REPOSITORY,
  type TicketedEventRepository,
} from './application/ports';
import { SeatInventory } from './application/seat-inventory.service';
import {
  InMemorySeatRepository,
  InMemoryTicketedEventRepository,
} from './infrastructure/in-memory-events.repositories';
import {
  KyselySeatRepository,
  KyselyTicketedEventRepository,
} from './infrastructure/kysely-events.repositories';
import { EventsController } from './http/events.controller';

@Module({
  controllers: [EventsController],
  providers: [
    repositoryProvider<TicketedEventRepository>(TICKETED_EVENT_REPOSITORY, {
      memory: (store) => new InMemoryTicketedEventRepository(store),
      postgres: (database) => new KyselyTicketedEventRepository(database),
    }),
    repositoryProvider<SeatRepository>(SEAT_REPOSITORY, {
      memory: (store) => new InMemorySeatRepository(store),
      postgres: (database) => new KyselySeatRepository(database),
    }),
    AvailabilityCache,
    CreateEventUseCase,
    GetAvailabilityQuery,
    SeatInventory,
  ],
  exports: [TICKETED_EVENT_REPOSITORY, SeatInventory],
})
export class EventsModule {}
