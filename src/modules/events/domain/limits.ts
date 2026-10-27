export const LABEL_PATTERN = /^[A-Z0-9]{1,8}$/;
export const TIER_CODE_PATTERN = /^[A-Z0-9_]{1,16}$/;
export const SEAT_ID_PATTERN = /^([A-Z0-9]{1,8})-([A-Z0-9]{1,8})-([1-9]\d{0,3})$/;

export const MAX_SEATS_PER_ROW = 200;
export const MAX_ROWS_PER_SECTION = 100;
export const MAX_SECTIONS_PER_EVENT = 50;
export const MAX_SEATS_PER_EVENT = 20_000;
export const MAX_PRICING_TIERS = 20;
/** One million in major units; anything above is almost certainly a units mistake. */
export const MAX_PRICE_MINOR = 100_000_000;
