import type { Clock } from '../../src/shared/application/clock';

const MS_PER_SECOND = 1000;

export class FakeClock implements Clock {
  private current: Date;

  constructor(start = new Date('2030-01-01T10:00:00.000Z')) {
    this.current = start;
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * MS_PER_SECOND);
  }
}
