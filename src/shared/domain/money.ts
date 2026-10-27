import { InvariantViolationError } from './domain-error';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Monetary amount in integer minor units (cents), so arithmetic never touches floating point. */
export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: string,
  ) {}

  static of(amountMinor: number, currency: string): Money {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      throw new InvariantViolationError('Money amount must be a non-negative integer of minor units', {
        amountMinor,
      });
    }
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new InvariantViolationError('Currency must be an ISO 4217 code', { currency });
    }
    return new Money(amountMinor, currency);
  }

  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  static sum(amounts: readonly Money[], currency: string): Money {
    return amounts.reduce((total, amount) => total.add(amount), Money.zero(currency));
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor + other.amountMinor, this.currency);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new InvariantViolationError('Cannot combine amounts in different currencies', {
        left: this.currency,
        right: other.currency,
      });
    }
  }
}
