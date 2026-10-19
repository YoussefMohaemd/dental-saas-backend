import { ZodError } from 'zod';

import { env } from '../../../config/env';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../application/errors/application-error';
import { DOMAIN_ERROR_CODES, DomainError } from '../../domain/errors/domain-error';
import { type ApiErrorEnvelope } from './api-response';

interface MappedHttpError {
  statusCode: number;
  payload: ApiErrorEnvelope;
}

const domainHttpMapping: Record<
  (typeof DOMAIN_ERROR_CODES)[keyof typeof DOMAIN_ERROR_CODES],
  { statusCode: number; code: string }
> = {
  BUSINESS_RULE_VIOLATION: { statusCode: 422, code: DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION },
  ENTITY_NOT_FOUND: { statusCode: 404, code: DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND },
  ENTITY_CONFLICT: { statusCode: 409, code: DOMAIN_ERROR_CODES.ENTITY_CONFLICT },
  INVARIANT_VIOLATION: { statusCode: 422, code: DOMAIN_ERROR_CODES.INVARIANT_VIOLATION },
};

export function mapErrorToHttp(error: unknown): MappedHttpError {
  if (error instanceof ApplicationError) {
    return {
      statusCode: error.statusCode,
      payload: {
        error: {
          code: error.code,
          message: error.expose || env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error',
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }

  if (error instanceof DomainError) {
    const mapping = domainHttpMapping[error.code];

    return {
      statusCode: mapping.statusCode,
      payload: {
        error: {
          code: mapping.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      payload: {
        error: {
          code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: {
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
      },
    };
  }

  return {
    statusCode: 500,
    payload: {
      error: {
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
        message: 'Internal Server Error',
      },
    },
  };
}
