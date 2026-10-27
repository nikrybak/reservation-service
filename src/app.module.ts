import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { BookingsModule } from './modules/bookings/bookings.module';
import { EventsModule } from './modules/events/events.module';
import { HealthController } from './modules/health/health.controller';
import { HoldsModule } from './modules/holds/holds.module';
import { ApplicationCoreModule } from './shared/application/application-core.module';
import { ApiKeyGuard } from './shared/auth/api-key.guard';
import { RolesGuard } from './shared/auth/roles.guard';
import type { AppConfig } from './shared/config/app-config';
import { ConfigModule } from './shared/config/config.module';
import { CorrelationIdMiddleware, ensureCorrelationId } from './shared/http/correlation-id';
import { LoggingInterceptor } from './shared/http/logging.interceptor';
import { ProblemDetailsFilter } from './shared/http/problem-details.filter';
import { createValidationPipe } from './shared/http/request-validation';
import { OutboxModule } from './shared/outbox/outbox.module';
import { PersistenceModule } from './shared/persistence/persistence.module';

@Module({})
export class AppModule implements NestModule {
  /** Config is passed in rather than read here so tests can boot the app with their own. */
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.logLevel,
            autoLogging: false,
            genReqId: (request, response) => ensureCorrelationId(request, response),
            customAttributeKeys: { reqId: 'correlationId' },
            redact: ['req.headers["x-api-key"]', 'req.headers.authorization'],
            ...(config.nodeEnv === 'development'
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
          },
        }),
        ScheduleModule.forRoot(),
        PersistenceModule.forRoot(config.persistence),
        ApplicationCoreModule,
        OutboxModule,
        EventsModule,
        HoldsModule,
        BookingsModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_GUARD, useClass: ApiKeyGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_PIPE, useFactory: createValidationPipe },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
