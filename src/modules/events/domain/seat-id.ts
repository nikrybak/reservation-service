import { InvalidSeatIdError } from './errors';
import { SEAT_ID_PATTERN } from './limits';

/** Seat identity within an event, rendered as SECTION-ROW-NUMBER, e.g. "A-12-7". */
export class SeatId {
  private constructor(
    readonly section: string,
    readonly row: string,
    readonly number: number,
  ) {}

  static of(section: string, row: string, number: number): SeatId {
    return SeatId.parse(`${section}-${row}-${number}`);
  }

  static parse(raw: string): SeatId {
    const match = SEAT_ID_PATTERN.exec(raw);
    if (!match) {
      throw new InvalidSeatIdError(raw);
    }
    const [, section, row, number] = match;
    return new SeatId(section ?? '', row ?? '', Number(number));
  }

  equals(other: SeatId): boolean {
    return this.toString() === other.toString();
  }

  toString(): string {
    return `${this.section}-${this.row}-${this.number}`;
  }
}
