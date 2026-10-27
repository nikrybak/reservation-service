import { Module } from '@nestjs/common';
import { repositoryProvider } from '../../shared/persistence/repository-provider';
import { EventsModule } from '../events/events.module';
import { HoldsModule } from '../holds/holds.module';
import { CancelBookingUseCase } from './application/cancel-booking.use-case';
import { ConfirmHoldUseCase } from './application/confirm-hold.use-case';
import { GetBookingQuery } from './application/get-booking.query';
import { BOOKING_REPOSITORY, type BookingRepository } from './application/ports';
import { BookingsController } from './http/bookings.controller';
import { InMemoryBookingRepository } from './infrastructure/in-memory-booking.repository';
import { KyselyBookingRepository } from './infrastructure/kysely-booking.repository';

@Module({
  imports: [EventsModule, HoldsModule],
  controllers: [BookingsController],
  providers: [
    repositoryProvider<BookingRepository>(BOOKING_REPOSITORY, {
      memory: (store) => new InMemoryBookingRepository(store),
      postgres: (database) => new KyselyBookingRepository(database),
    }),
    ConfirmHoldUseCase,
    CancelBookingUseCase,
    GetBookingQuery,
  ],
})
export class BookingsModule {}
