import {
  type DynamicModule,
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { TRANSACTION_MANAGER } from '../application/transaction-manager';
import type { PersistenceConfig } from '../config/app-config';
import { InMemoryStore } from './in-memory/in-memory-store';
import { PERSISTENCE_HANDLE, type PersistenceHandle } from './persistence-handle';
import { KyselyDatabase } from './postgres/kysely-database';

@Global()
@Module({})
export class PersistenceModule implements OnApplicationShutdown {
  constructor(@Inject(PERSISTENCE_HANDLE) private readonly handle: PersistenceHandle) {}

  static forRoot(config: PersistenceConfig): DynamicModule {
    return {
      module: PersistenceModule,
      providers: [
        {
          provide: PERSISTENCE_HANDLE,
          useFactory: (): PersistenceHandle =>
            config.driver === 'memory'
              ? { driver: 'memory', store: new InMemoryStore() }
              : { driver: 'postgres', database: KyselyDatabase.connect(config.databaseUrl) },
        },
        {
          provide: TRANSACTION_MANAGER,
          inject: [PERSISTENCE_HANDLE],
          useFactory: (handle: PersistenceHandle) =>
            handle.driver === 'memory' ? handle.store : handle.database,
        },
      ],
      exports: [PERSISTENCE_HANDLE, TRANSACTION_MANAGER],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.handle.driver === 'postgres') {
      await this.handle.database.close();
    }
  }
}
