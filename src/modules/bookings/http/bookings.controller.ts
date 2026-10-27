import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal, Roles } from '../../../shared/auth/auth.decorators';
import type { Principal } from '../../../shared/auth/principal';
import { RequestHeader } from '../../../shared/http/request-header.decorator';
import { CancelBookingUseCase } from '../application/cancel-booking.use-case';
import { ConfirmHoldUseCase } from '../application/confirm-hold.use-case';
import { GetBookingQuery } from '../application/get-booking.query';
import type { IdempotencyKey } from '../domain/idempotency-key';
import { BookingResponse, CancelBookingRequest } from './dto/booking.dto';
import { IDEMPOTENCY_KEY_HEADER, IdempotencyKeyPipe } from './idempotency-key.pipe';

const REPLAYED_HEADER = 'idempotent-replayed';

@Controller()
export class BookingsController {
  constructor(
    private readonly confirmHold: ConfirmHoldUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
    private readonly getBooking: GetBookingQuery,
  ) {}

  @Post('holds/:holdId/confirm')
  async confirm(
    @Param('holdId', ParseUUIDPipe) holdId: string,
    @RequestHeader(IDEMPOTENCY_KEY_HEADER, IdempotencyKeyPipe) idempotencyKey: IdempotencyKey,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingResponse> {
    const { booking, replayed } = await this.confirmHold.execute({
      holdId,
      idempotencyKey,
      principal,
    });
    response.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
    response.setHeader(REPLAYED_HEADER, String(replayed));
    return BookingResponse.from(booking);
  }

  @Get('bookings/:bookingId')
  async get(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<BookingResponse> {
    return BookingResponse.from(await this.getBooking.execute(bookingId, principal));
  }

  @Post('bookings/:bookingId/cancel')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() body: CancelBookingRequest,
  ): Promise<BookingResponse> {
    const booking = await this.cancelBooking.execute({
      bookingId,
      reason: body.reason ?? null,
    });
    return BookingResponse.from(booking);
  }
}
