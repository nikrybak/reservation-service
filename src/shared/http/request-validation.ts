import { ValidationPipe, type ValidationError } from '@nestjs/common';

export interface FieldViolation {
  readonly field: string;
  readonly messages: readonly string[];
}

export class RequestValidationError extends Error {
  constructor(readonly violations: readonly FieldViolation[]) {
    super('Request validation failed');
    this.name = RequestValidationError.name;
  }
}

export function flattenValidationErrors(
  errors: readonly ValidationError[],
  parent = '',
): FieldViolation[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => new RequestValidationError(flattenValidationErrors(errors)),
  });
}
