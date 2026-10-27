import type { FactoryProvider, InjectionToken } from '@nestjs/common';
import type { InMemoryStore } from './in-memory/in-memory-store';
import { PERSISTENCE_HANDLE, type PersistenceHandle } from './persistence-handle';
import type { KyselyDatabase } from './postgres/kysely-database';

export interface RepositoryFactories<T> {
  readonly memory: (store: InMemoryStore) => T;
  readonly postgres: (database: KyselyDatabase) => T;
}

/** Binds a repository port to the adapter that matches the configured driver. */
export function repositoryProvider<T>(
  token: InjectionToken,
  factories: RepositoryFactories<T>,
): FactoryProvider<T> {
  return {
    provide: token,
    inject: [PERSISTENCE_HANDLE],
    useFactory: (handle: PersistenceHandle): T =>
      handle.driver === 'memory'
        ? factories.memory(handle.store)
        : factories.postgres(handle.database),
  };
}
