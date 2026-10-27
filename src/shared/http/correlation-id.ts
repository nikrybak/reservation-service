import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
const ACCEPTED_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

type CorrelatedRequest = IncomingMessage & { correlationId?: string };

/**
 * Idempotent on purpose: both this middleware and the pino request-id hook call it, and
 * whichever runs first wins, so the id in logs always matches the response header.
 */
export function ensureCorrelationId(request: IncomingMessage, response: ServerResponse): string {
  const correlated = request as CorrelatedRequest;
  if (correlated.correlationId) {
    return correlated.correlationId;
  }
  const incoming = request.headers[CORRELATION_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const id = candidate && ACCEPTED_CORRELATION_ID.test(candidate) ? candidate : randomUUID();
  correlated.correlationId = id;
  response.setHeader(CORRELATION_ID_HEADER, id);
  return id;
}

export function correlationIdOf(request: IncomingMessage): string | undefined {
  return (request as CorrelatedRequest).correlationId;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: IncomingMessage, response: ServerResponse, next: () => void): void {
    ensureCorrelationId(request, response);
    next();
  }
}
