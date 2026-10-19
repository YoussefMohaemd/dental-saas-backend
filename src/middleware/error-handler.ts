import { type NextFunction, type Request, type Response } from 'express';
import { mapErrorToHttp } from '../shared/presentation/http/error-mapping';
import { sendError } from '../shared/presentation/http/api-response';

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const mappedError = mapErrorToHttp(error);
  const { statusCode } = mappedError;
  const code = mappedError.payload.error.code;

  const requestLogger = req.log ?? console;
  const payload = { err: error, code, statusCode };
  if (statusCode >= 500) {
    requestLogger.error(payload, 'Unhandled request error');
  } else {
    requestLogger.warn(payload, 'Handled request error');
  }

  sendError(res, statusCode, mappedError.payload);
}
