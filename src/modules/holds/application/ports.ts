import type { Hold } from '../domain/hold';

export const HOLD_REPOSITORY = Symbol('HOLD_REPOSITORY');
export const HOLD_POLICY = Symbol('HOLD_POLICY');

export interface HoldRepository {
  insert(hold: Hold): Promise<void>;
  findById(id: string): Promise<Hold | null>;
  /** Throws ConcurrencyConflictError when the hold changed since it was loaded. */
  save(hold: Hold): Promise<void>;
  findExpiredActiveIds(now: Date, limit: number): Promise<string[]>;
}
