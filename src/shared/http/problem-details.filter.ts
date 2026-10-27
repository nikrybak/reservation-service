import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError, type DomainErrorKind } from '../domain/domain-error';
import { correlationIdOf } from './correlation-id';
import { type FieldViolation, RequestValidationError } from './request-validation';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
const PROBLEM_TYPE_BASE = 'https://reservation-service.example/problems/';

const STATUS_BY_KIND: Readonly<Record<DomainErrorKind, HttpStatus>> = {
  validation: HttpStatus.UNPROCESSABLE_ENTITY,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  gone: HttpStatus.GONE,
  forbidden: HttpStatus.FORBIDDEN,
};

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
  readonly correlationId?: string;
  readonly errors?: readonly FieldViolation[];
  readonly context?: Readonly<Record<string, unknown>>;
}

type ProblemBody = Omit<ProblemDetails, 'type' | 'instance' | 'correlationId' | 'title'>;

/** Maps every failure to RFC 9457 problem+json so clients handle one error shape. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const body = this.toProblem(exception);

    if (body.status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error({ err: exception }, 'Unhandled error');
    }

    const correlationId = correlationIdOf(request);
    const problem: ProblemDetails = {
      type: `${PROBLEM_TYPE_BASE}${body.code}`,
      title: titleFor(body.status),
      instance: request.originalUrl,
      ...body,
      ...(correlationId ? { correlationId } : {}),
    };
    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }

  private toProblem(exception: unknown): ProblemBody {
    if (exception instanceof RequestValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'request_validation_failed',
        detail: exception.message,
        errors: exception.violations,
      };
    }
    if (exception instanceof DomainError) {
      return {
        status: STATUS_BY_KIND[exception.kind],
        code: exception.code,
        detail: exception.message,
        context: exception.details,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, code: codeFor(status), detail: messageOf(exception) };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal_error',
      detail: 'An unexpected error occurred',
    };
  }
}

function titleFor(status: number): string {
  const name = HttpStatus[status];
  return typeof name === 'string' ? name.toLowerCase().split('_').map(capitalize).join(' ') : 'Error';
}

function codeFor(status: number): string {
  const name = HttpStatus[status];
  return typeof name === 'string' ? name.toLowerCase() : 'http_error';
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message.join('; ');
  }
  return typeof message === 'string' ? message : exception.message;
}
