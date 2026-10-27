import { InvariantViolationError } from '../../../src/shared/domain/domain-error';
import { Money } from '../../../src/shared/domain/money';
import { InvalidSeatIdError } from '../../../src/modules/events/domain/errors';
import { SeatId } from '../../../src/modules/events/domain/seat-id';
import { IdempotencyKey } from '../../../src/modules/bookings/domain/idempotency-key';
import { InvalidIdempotencyKeyError } from '../../../src/modules/bookings/domain/errors';

describe('Money', () => {
  it('adds amounts in the same currency', () => {
    expect(Money.of(1_250, 'EUR').add(Money.of(750, 'EUR')).amountMinor).toBe(2_000);
  });

  it('sums an empty list to zero', () => {
    expect(Money.sum([], 'EUR').equals(Money.zero('EUR'))).toBe(true);
  });

  it.each([1.5, -1, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    'rejects %p as an amount of minor units',
    (amount) => {
      expect(() => Money.of(amount, 'EUR')).toThrow(InvariantViolationError);
    },
  );

  it('rejects malformed currency codes', () => {
    expect(() => Money.of(100, 'eur')).toThrow(InvariantViolationError);
  });

  it('refuses to mix currencies', () => {
    expect(() => Money.of(100, 'EUR').add(Money.of(100, 'USD'))).toThrow(InvariantViolationError);
  });
});

describe('SeatId', () => {
  it('round-trips through its string form', () => {
    const seatId = SeatId.parse('A-12-7');
    expect([seatId.section, seatId.row, seatId.number]).toEqual(['A', '12', 7]);
    expect(seatId.toString()).toBe('A-12-7');
    expect(seatId.equals(SeatId.of('A', '12', 7))).toBe(true);
  });

  it.each(['', 'A-1', 'a-1-1', 'A-1-0', 'A-1-01', 'TOOLONGSECTION-1-1', 'A-1-1-1'])(
    'rejects %p',
    (raw) => {
      expect(() => SeatId.parse(raw)).toThrow(InvalidSeatIdError);
    },
  );
});

describe('IdempotencyKey', () => {
  it('accepts UUID-like keys', () => {
    expect(IdempotencyKey.parse('3f6c1c5e-8d1b-4c1e-9d55-0c3f3b1b2a10').value).toHaveLength(36);
  });

  it.each(['short', 'has spaces in it', 'x'.repeat(129)])('rejects %p', (raw) => {
    expect(() => IdempotencyKey.parse(raw)).toThrow(InvalidIdempotencyKeyError);
  });
});
