import { type NextFunction, type Request, type Response } from 'express';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../shared/application/errors/application-error';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    new ApplicationError({
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    }),
  );
}
