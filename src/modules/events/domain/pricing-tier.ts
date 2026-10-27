import { InvariantViolationError } from '../../../shared/domain/domain-error';
import type { Money } from '../../../shared/domain/money';
import { MAX_PRICE_MINOR, TIER_CODE_PATTERN } from './limits';

export class PricingTier {
  private constructor(
    readonly code: string,
    readonly name: string,
    readonly price: Money,
  ) {}

  static create(code: string, name: string, price: Money): PricingTier {
    if (!TIER_CODE_PATTERN.test(code)) {
      throw new InvariantViolationError('Invalid pricing tier code', { code });
    }
    if (name.trim().length === 0) {
      throw new InvariantViolationError('Pricing tier name must not be blank', { code });
    }
    if (price.amountMinor > MAX_PRICE_MINOR) {
      throw new InvariantViolationError('Pricing tier price exceeds the allowed maximum', {
        code,
        max: MAX_PRICE_MINOR,
      });
    }
    return new PricingTier(code, name.trim(), price);
  }
}
