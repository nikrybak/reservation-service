import { Injectable, type PipeTransform } from '@nestjs/common';
import { RequestValidationError } from '../../../shared/http/request-validation';
import { IdempotencyKey } from '../domain/idempotency-key';
import { InvalidIdempotencyKeyError } from '../domain/errors';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** A missing or malformed header is a malformed request (400), not a business rule (422). */
@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<string | undefined, IdempotencyKey> {
  transform(value: string | undefined): IdempotencyKey {
    if (value === undefined || value.length === 0) {
      throw invalid('Idempotency-Key header is required');
    }
    try {
      return IdempotencyKey.parse(value);
    } catch (error) {
      if (error instanceof InvalidIdempotencyKeyError) {
        throw invalid(error.message);
      }
      throw error;
    }
  }
}

function invalid(message: string): RequestValidationError {
  return new RequestValidationError([{ field: 'Idempotency-Key', messages: [message] }]);
}
