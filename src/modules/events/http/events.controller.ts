import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../../shared/auth/auth.decorators';
import { CreateEventUseCase } from '../application/create-event.use-case';
import { GetAvailabilityQuery } from '../application/get-availability.query';
import { CreateEventRequest } from './dto/create-event.request';
import { AvailabilityResponse, EventResponse } from './dto/event.responses';

const CACHE_STATUS_HEADER = 'x-cache';

@Controller('events')
export class EventsController {
  constructor(
    private readonly createEvent: CreateEventUseCase,
    private readonly getAvailability: GetAvailabilityQuery,
  ) {}

  @Post()
  @Roles('admin')
  async create(@Body() body: CreateEventRequest): Promise<EventResponse> {
    const created = await this.createEvent.execute({
      name: body.name,
      venue: body.venue,
      startsAt: new Date(body.startsAt),
      currency: body.currency,
      pricingTiers: body.pricingTiers,
      sections: body.sections.map((section) => ({
        name: section.name,
        rows: section.rows.map((row) => ({
          name: row.name,
          tierCode: row.tier,
          seatCount: row.seatCount,
        })),
      })),
    });
    return EventResponse.from(created);
  }

  @Get(':eventId/availability')
  async availability(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AvailabilityResponse> {
    const { snapshot, cacheHit } = await this.getAvailability.execute(eventId);
    response.setHeader(CACHE_STATUS_HEADER, cacheHit ? 'hit' : 'miss');
    return AvailabilityResponse.from(snapshot);
  }
}
