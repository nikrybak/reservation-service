import type { Money } from '../domain/money';

export class MoneyResponse {
  private constructor(
    readonly amountMinor: number,
    readonly currency: string,
  ) {}

  static from(money: Money): MoneyResponse {
    return new MoneyResponse(money.amountMinor, money.currency);
  }
}
