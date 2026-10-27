import { AsyncLocalStorage } from 'node:async_hooks';
import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import { Pool } from 'pg';
import type { TransactionManager } from '../../application/transaction-manager';
import type { Database } from './database';

const UNIQUE_VIOLATION = '23505';

export class KyselyDatabase implements TransactionManager {
  private readonly context = new AsyncLocalStorage<Transaction<Database>>();

  constructor(readonly root: Kysely<Database>) {}

  static connect(databaseUrl: string): KyselyDatabase {
    return new KyselyDatabase(
      new Kysely<Database>({
        dialect: new PostgresDialect({ pool: new Pool({ connectionString: databaseUrl }) }),
      }),
    );
  }

  /** The ambient transaction if one is open, otherwise the pool. */
  get executor(): Kysely<Database> {
    return this.context.getStore() ?? this.root;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) {
      return work();
    }
    return this.root.transaction().execute((trx) => this.context.run(trx, work));
  }

  async close(): Promise<void> {
    await this.root.destroy();
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  );
}
