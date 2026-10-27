import { IsOptional, IsString, Length } from 'class-validator';
import { MoneyResponse } from '../../../../shared/http/money.response';
import type { Booking, BookingStatus } from '../../domain/booking';

const MAX_REASON_LENGTH = 500;

export class CancelBookingRequest {
  @IsOptional()
  @IsString()
  @Length(1, MAX_REASON_LENGTH)
  reason?: string;
}

export class BookedSeatResponse {
  constructor(
    readonly seatId: string,
    readonly tier: string,
    readonly price: MoneyResponse,
  ) {}
}

export class BookingResponse {
  private constructor(
    readonly id: string,
    readonly holdId: string,
    readonly eventId: string,
    readonly status: BookingStatus,
    readonly seats: readonly BookedSeatResponse[],
    readonly total: MoneyResponse,
    readonly createdAt: string,
    readonly cancelledAt: string | null,
  ) {}

  static from(booking: Booking): BookingResponse {
    const state = booking.snapshot();
    return new BookingResponse(
      state.id,
      state.holdId,
      state.ticketedEventId,
      state.status,
      state.seats.map(
        (seat) =>
          new BookedSeatResponse(seat.seatId, seat.tierCode, MoneyResponse.from(seat.price)),
      ),
      MoneyResponse.from(state.total),
      state.createdAt.toISOString(),
      state.cancelledAt?.toISOString() ?? null,
    );
  }
}
