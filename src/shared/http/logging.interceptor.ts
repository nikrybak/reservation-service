import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import type { Observable } from 'rxjs';

const NS_PER_MS = 1_000_000n;
const SERVER_ERROR_STATUS = 500;

/**
 * One structured line per routed request, written when the response is flushed so the
 * logged status is the final one, including statuses set by the exception filter.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();
    const handler = `${context.getClass().name}.${context.getHandler().name}`;

    response.once('finish', () => {
      const fields = {
        method: request.method,
        path: request.originalUrl,
        handler,
        status: response.statusCode,
        durationMs: Number((process.hrtime.bigint() - startedAt) / NS_PER_MS),
      };
      if (response.statusCode >= SERVER_ERROR_STATUS) {
        this.logger.error(fields, 'request failed');
      } else {
        this.logger.info(fields, 'request completed');
      }
    });

    return next.handle();
  }
}
