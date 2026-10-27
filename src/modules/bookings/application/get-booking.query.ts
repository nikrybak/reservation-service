import { Inject, Injectable } from '@nestjs/common';
import { canActOn, type Principal } from '../../../shared/auth/principal';
import type { Booking } from '../domain/booking';
import { BookingNotFoundError } from '../domain/errors';
import { BOOKING_REPOSITORY, type BookingRepository } from './ports';

@Injectable()
export class GetBookingQuery {
  constructor(@Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository) {}

  async execute(bookingId: string, principal: Principal): Promise<Booking> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking || !canActOn(principal, booking.holderId)) {
      throw new BookingNotFoundError(bookingId);
    }
    return booking;
  }
}
