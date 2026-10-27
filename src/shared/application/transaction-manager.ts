export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');

/**
 * Runs work atomically. Repositories pick up the ambient transaction themselves,
 * so use cases never pass connection handles around.
 */
export interface TransactionManager {
  run<T>(work: () => Promise<T>): Promise<T>;
}
