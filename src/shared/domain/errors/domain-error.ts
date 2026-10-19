export const DOMAIN_ERROR_CODES = {
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',
  ENTITY_CONFLICT: 'ENTITY_CONFLICT',
  INVARIANT_VIOLATION: 'INVARIANT_VIOLATION',
} as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[keyof typeof DOMAIN_ERROR_CODES];

export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly details: Record<string, unknown> | undefined;

  public constructor(
    message: string,
    code: DomainErrorCode = DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}
