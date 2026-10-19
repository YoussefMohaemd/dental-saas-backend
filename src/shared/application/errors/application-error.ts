export const APPLICATION_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApplicationErrorCode =
  (typeof APPLICATION_ERROR_CODES)[keyof typeof APPLICATION_ERROR_CODES];

export class ApplicationError extends Error {
  public readonly statusCode: number;
  public readonly code: ApplicationErrorCode;
  public readonly expose: boolean;
  public readonly details: Record<string, unknown> | undefined;

  public constructor(params: {
    message: string;
    statusCode?: number;
    code?: ApplicationErrorCode;
    expose?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'ApplicationError';
    this.statusCode = params.statusCode ?? 500;
    this.code = params.code ?? APPLICATION_ERROR_CODES.INTERNAL_ERROR;
    this.expose = params.expose ?? false;
    this.details = params.details;
  }
}
