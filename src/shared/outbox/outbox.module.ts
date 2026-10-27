import { Global, Module } from '@nestjs/common';
import { OUTBOX_REPOSITORY, type OutboxRepository } from '../application/outbox.repository';
import { repositoryProvider } from '../persistence/repository-provider';
import { EventSubscribers } from './application/event-subscribers';
import { OutboxDispatcher } from './application/outbox-dispatcher';
import { InMemoryOutboxRepository } from './infrastructure/in-memory-outbox.repository';
import { KyselyOutboxRepository } from './infrastructure/kysely-outbox.repository';
import { LoggingEventSubscriber } from './infrastructure/logging-event.subscriber';
import { OutboxPoller } from './infrastructure/outbox-poller';

@Global()
@Module({
  providers: [
    repositoryProvider<OutboxRepository>(OUTBOX_REPOSITORY, {
      memory: (store) => new InMemoryOutboxRepository(store),
      postgres: (database) => new KyselyOutboxRepository(database),
    }),
    EventSubscribers,
    OutboxDispatcher,
    OutboxPoller,
    LoggingEventSubscriber,
  ],
  exports: [OUTBOX_REPOSITORY, EventSubscribers, OutboxDispatcher],
})
export class OutboxModule {}
