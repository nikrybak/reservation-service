import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  Matches,
  Min,
} from 'class-validator';
import { MoneyResponse } from '../../../../shared/http/money.response';
import { SEAT_ID_PATTERN } from '../../../events/domain/limits';
import type { Hold, HoldStatus } from '../../domain/hold';
import { MIN_HOLD_TTL_SECONDS } from '../../domain/hold-policy';

/** Transport-level ceiling; the configurable business limit is enforced by HoldPolicy. */
const MAX_SEATS_PER_REQUEST = 100;

export class PlaceHoldRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SEATS_PER_REQUEST)
  @ArrayUnique()
  @Matches(SEAT_ID_PATTERN, { each: true, message: 'each seat id must look like SECTION-ROW-NUMBER' })
  seatIds!: string[];

  @IsOptional()
  @IsInt()
  @Min(MIN_HOLD_TTL_SECONDS)
  ttlSeconds?: number;
}

export class HoldResponse {
  private constructor(
    readonly id: string,
    readonly eventId: string,
    readonly status: HoldStatus,
    readonly seatIds: readonly string[],
    readonly total: MoneyResponse,
    readonly expiresAt: string,
  ) {}

  static from(hold: Hold): HoldResponse {
    return new HoldResponse(
      hold.id,
      hold.ticketedEventId,
      hold.status,
      hold.seatIds,
      MoneyResponse.from(hold.total),
      hold.expiresAt.toISOString(),
    );
  }
}
