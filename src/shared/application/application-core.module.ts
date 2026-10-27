import { Global, Module } from '@nestjs/common';
import { CLOCK, SystemClock } from './clock';
import { CommittedEventsBus } from './committed-events.bus';
import { UnitOfWork } from './unit-of-work';

@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }, CommittedEventsBus, UnitOfWork],
  exports: [CLOCK, CommittedEventsBus, UnitOfWork],
})
export class ApplicationCoreModule {}
