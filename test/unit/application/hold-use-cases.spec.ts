import { IdempotencyKey } from '../../../src/modules/bookings/domain/idempotency-key';
import { IdempotencyKeyReusedError } from '../../../src/modules/bookings/domain/errors';
import {
  SeatsUnavailableError,
  UnknownSeatsError,
} from '../../../src/modules/events/domain/errors';
import { SeatId } from '../../../src/modules/events/domain/seat-id';
import { HoldExpiredError, HoldNotFoundError } from '../../../src/modules/holds/domain/errors';
import type { Principal } from '../../../src/shared/auth/principal';
import { createInMemoryContext, seedEvent } from '../../support/in-memory-context';

const shopA: Principal = { id: 'shop-a', role: 'client' };
const shopB: Principal = { id: 'shop-b', role: 'client' };
const key = (raw: string) => IdempotencyKey.parse(raw);

describe('PlaceHoldUseCase', () => {
  it('holds seats atomically and writes SeatsHeld to the outbox', async () => {
    const context = createInMemoryContext();
    const event = await seedEvent(context);

    const hold = await context.placeHold.execute({
      ticketedEventId: event.id,
      seatIds: ['A-1-1', 'A-1-2'],
      principal: shopA,
    });

    const seats = await context.seats.findByIds(event.id, [
      SeatId.parse('A-1-1'),
      SeatId.parse('A-1-3'),
    ]);
    expect(seats.map((seat) => seat.status)).toEqual(['held', 'available']);
    expect(hold.total.amountMinor).toBe(10_000);
    expect(context.outbox.records().map((record) => record.name)).toEqual(['SeatsHeld']);
  });

  it('leaves no trace when one requested seat is taken', async () => {
    const context = createInMemoryContext();
    const event = await seedEvent(context);
    await context.placeHold.execute({
      ticketedEventId: event.id,
      seatIds: ['A-1-2'],
      principal: shopA,
    });

    await expect(
      context.placeHold.execute({
        ticketedEventId: event.id,
        seatIds: ['A-1-1', 'A-1-2'],
        principal: shopB,
      }),
    ).rejects.toThrow(SeatsUnavailableError);

    const [first] = await context.seats.findByIds(event.id, [SeatId.parse('A-1-1')]);
    expect(first?.status).toBe('available');
    expect(context.outbox.records()).toHaveLength(1);
  });

  it('reports seats that do not exist', async () => {
    const context = createInMemoryContext();
    const event = await seedEvent(context);
    await expect(
      context.placeHold.execute({
        ticketedEventId: event.id,
        seatIds: ['Z-9-9'],
        principal: shopA,
      }),
    ).rejects.toThrow(UnknownSeatsError);
  });

  it('lets exactly one of many concurrent requests win a seat', async () => {
    const context = createInMemoryContext();
    const event = await seedEvent(context);
    const attempts = 8;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        context.placeHold.execute({
          ticketedEventId: event.id,
          seatIds: ['A-1-1'],
          principal: shopA,
        }),
      ),
    );

    const rejected = results.filter((result) => result.status === 'rejected');
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(attempts - 1);
    rejected.forEach((result) => expect(result.reason).toBeInstanceOf(SeatsUnavailableError));
  });
});

describe('ConfirmHoldUseCase', () => {
  async function holdSeat() {
    const context = createInMemoryContext();
    const event = await seedEvent(context);
    const hold = await context.placeHold.execute({
      ticketedEventId: event.id,
      seatIds: ['A-1-1'],
      principal: shopA,
    });
    return { context, event, hold };
  }

  it('books the seats and replays the same booking for a repeated key', async () => {
    const { context, event, hold } = await holdSeat();

    const first = await context.confirmHold.execute({
      holdId: hold.id,
      idempotencyKey: key('order-0001'),
      principal: shopA,
    });
    const second = await context.confirmHold.execute({
      holdId: hold.id,
      idempotencyKey: key('order-0001'),
      principal: shopA,
    });

    expect(first.replayed).toBe(false);
    expect(second).toMatchObject({ replayed: true });
    expect(second.booking.id).toBe(first.booking.id);
    const [seat] = await context.seats.findByIds(event.id, [SeatId.parse('A-1-1')]);
    expect(seat?.status).toBe('booked');
    expect(context.outbox.records().map((record) => record.name)).toEqual([
      'SeatsHeld',
      'BookingConfirmed',
    ]);
  });

  it('resolves concurrent confirmations with one key to a single booking', async () => {
    const { context, hold } = await holdSeat();
    const confirm = () =>
      context.confirmHold.execute({
        holdId: hold.id,
        idempotencyKey: key('order-0002'),
        principal: shopA,
      });

    const results = await Promise.all([confirm(), confirm(), confirm()]);

    expect(new Set(results.map((result) => result.booking.id)).size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
  });

  it('rejects a key that was used for another hold', async () => {
    const { context, event, hold } = await holdSeat();
    await context.confirmHold.execute({
      holdId: hold.id,
      idempotencyKey: key('order-0003'),
      principal: shopA,
    });
    const other = await context.placeHold.execute({
      ticketedEventId: event.id,
      seatIds: ['A-1-2'],
      principal: shopA,
    });

    await expect(
      context.confirmHold.execute({
        holdId: other.id,
        idempotencyKey: key('order-0003'),
        principal: shopA,
      }),
    ).rejects.toThrow(IdempotencyKeyReusedError);
  });

  it('refuses an expired hold even before the sweeper ran', async () => {
    const { context, hold } = await holdSeat();
    context.clock.advanceSeconds(301);

    await expect(
      context.confirmHold.execute({
        holdId: hold.id,
        idempotencyKey: key('order-0004'),
        principal: shopA,
      }),
    ).rejects.toThrow(HoldExpiredError);
  });

  it('hides holds that belong to someone else', async () => {
    const { context, hold } = await holdSeat();
    await expect(
      context.confirmHold.execute({
        holdId: hold.id,
        idempotencyKey: key('order-0005'),
        principal: shopB,
      }),
    ).rejects.toThrow(HoldNotFoundError);
  });
});
