import type { InMemoryStore } from './in-memory/in-memory-store';
import type { KyselyDatabase } from './postgres/kysely-database';

export const PERSISTENCE_HANDLE = Symbol('PERSISTENCE_HANDLE');

export type PersistenceHandle =
  | { readonly driver: 'memory'; readonly store: InMemoryStore }
  | { readonly driver: 'postgres'; readonly database: KyselyDatabase };
