import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/application/clock';
import { UnitOfWork } from '../../../shared/application/unit-of-work';
import { SeatInventory } from '../../events/application/seat-inventory.service';
import type { Booking } from '../domain/booking';
import { BookingNotFoundError } from '../domain/errors';
import { BOOKING_REPOSITORY, type BookingRepository } from './ports';

export interface CancelBookingCommand {
  readonly bookingId: string;
  readonly reason: string | null;
}

@Injectable()
export class CancelBookingUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly inventory: SeatInventory,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(command: CancelBookingCommand): Promise<Booking> {
    return this.unitOfWork.execute(async (recordEvents) => {
      const booking = await this.bookings.findById(command.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(command.bookingId);
      }
      booking.cancel(this.clock.now(), command.reason);
      await this.inventory.releaseBooking(booking.ticketedEventId, booking.seatIds, booking.id);
      await this.bookings.save(booking);
      recordEvents(booking.pullEvents());
      return booking;
    });
  }
}
