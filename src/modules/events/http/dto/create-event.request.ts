import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO4217CurrencyCode,
  IsISO8601,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  LABEL_PATTERN,
  MAX_PRICE_MINOR,
  MAX_PRICING_TIERS,
  MAX_ROWS_PER_SECTION,
  MAX_SEATS_PER_ROW,
  MAX_SECTIONS_PER_EVENT,
  TIER_CODE_PATTERN,
} from '../../domain/limits';

const MAX_NAME_LENGTH = 200;
const MAX_TIER_NAME_LENGTH = 64;

export class PricingTierRequest {
  @Matches(TIER_CODE_PATTERN, { message: 'code must be 1-16 characters of A-Z, 0-9 or _' })
  code!: string;

  @IsString()
  @Length(1, MAX_TIER_NAME_LENGTH)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_MINOR)
  priceMinor!: number;
}

export class RowRequest {
  @Matches(LABEL_PATTERN, { message: 'name must be 1-8 characters of A-Z or 0-9' })
  name!: string;

  @Matches(TIER_CODE_PATTERN)
  tier!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_SEATS_PER_ROW)
  seatCount!: number;
}

export class SectionRequest {
  @Matches(LABEL_PATTERN, { message: 'name must be 1-8 characters of A-Z or 0-9' })
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ROWS_PER_SECTION)
  @ValidateNested({ each: true })
  @Type(() => RowRequest)
  rows!: RowRequest[];
}

export class CreateEventRequest {
  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  name!: string;

  @IsString()
  @Length(1, MAX_NAME_LENGTH)
  venue!: string;

  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsISO4217CurrencyCode()
  currency!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PRICING_TIERS)
  @ValidateNested({ each: true })
  @Type(() => PricingTierRequest)
  pricingTiers!: PricingTierRequest[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SECTIONS_PER_EVENT)
  @ValidateNested({ each: true })
  @Type(() => SectionRequest)
  sections!: SectionRequest[];
}
