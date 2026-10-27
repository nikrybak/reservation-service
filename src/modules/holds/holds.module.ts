import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/app-config';
import { repositoryProvider } from '../../shared/persistence/repository-provider';
import { EventsModule } from '../events/events.module';
import { ExpireHoldsUseCase } from './application/expire-holds.use-case';
import { PlaceHoldUseCase } from './application/place-hold.use-case';
import { HOLD_POLICY, HOLD_REPOSITORY, type HoldRepository } from './application/ports';
import { ReleaseHoldUseCase } from './application/release-hold.use-case';
import { HoldPolicy } from './domain/hold-policy';
import { HoldsController } from './http/holds.controller';
import { HoldExpiryScheduler } from './infrastructure/hold-expiry.scheduler';
import { InMemoryHoldRepository } from './infrastructure/in-memory-hold.repository';
import { KyselyHoldRepository } from './infrastructure/kysely-hold.repository';

@Module({
  imports: [EventsModule],
  controllers: [HoldsController],
  providers: [
    repositoryProvider<HoldRepository>(HOLD_REPOSITORY, {
      memory: (store) => new InMemoryHoldRepository(store),
      postgres: (database) => new KyselyHoldRepository(database),
    }),
    {
      provide: HOLD_POLICY,
      inject: [APP_CONFIG],
      useFactory: ({ holds }: AppConfig) =>
        new HoldPolicy(holds.maxSeats, holds.defaultTtlSeconds, holds.maxTtlSeconds),
    },
    PlaceHoldUseCase,
    ReleaseHoldUseCase,
    ExpireHoldsUseCase,
    HoldExpiryScheduler,
  ],
  exports: [HOLD_REPOSITORY],
})
export class HoldsModule {}
