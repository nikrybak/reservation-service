import { DomainError } from '../domain/domain-error';

/** Raised by repositories when a version check or unique constraint loses a race. */
export class ConcurrencyConflictError extends DomainError {
  readonly code = 'concurrency_conflict';
  readonly kind = 'conflict';

  constructor(resource: string, id: string) {
    super(`${resource} ${id} was modified concurrently`, { resource, id });
  }
}
