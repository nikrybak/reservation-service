export type DomainErrorKind = 'validation' | 'not_found' | 'conflict' | 'gone' | 'forbidden';

/**
 * Base for every expected business failure. The HTTP layer maps `kind` to a status code,
 * so domain code never has to know about transport concerns.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;

  constructor(
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvariantViolationError extends DomainError {
  readonly code = 'invariant_violation';
  readonly kind = 'validation';
}
