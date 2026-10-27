import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadConfig } from './shared/config/app-config';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  await app.listen(config.port);
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(`Failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
