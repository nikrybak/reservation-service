import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../../shared/auth/auth.decorators';
import type { Principal } from '../../../shared/auth/principal';
import { PlaceHoldUseCase } from '../application/place-hold.use-case';
import { ReleaseHoldUseCase } from '../application/release-hold.use-case';
import { HoldResponse, PlaceHoldRequest } from './dto/hold.dto';

@Controller()
export class HoldsController {
  constructor(
    private readonly placeHold: PlaceHoldUseCase,
    private readonly releaseHold: ReleaseHoldUseCase,
  ) {}

  @Post('events/:eventId/holds')
  async place(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: PlaceHoldRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<HoldResponse> {
    const hold = await this.placeHold.execute({
      ticketedEventId: eventId,
      seatIds: body.seatIds,
      principal,
      ...(body.ttlSeconds === undefined ? {} : { ttlSeconds: body.ttlSeconds }),
    });
    return HoldResponse.from(hold);
  }

  @Delete('holds/:holdId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(
    @Param('holdId', ParseUUIDPipe) holdId: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    await this.releaseHold.execute(holdId, principal);
  }
}
