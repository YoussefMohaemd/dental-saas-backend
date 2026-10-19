import { type NextFunction, type Request, type Response } from 'express';

export interface AuthenticatedPrincipal {
  userId: string;
  tenantId: string;
  roles: string[];
}

export interface RequestContext {
  requestId: string | undefined;
  principal: AuthenticatedPrincipal | undefined;
}

export type RequestWithContext = Request & {
  context: RequestContext;
};

export type AuthenticatedRequest = RequestWithContext & {
  context: RequestContext & {
    principal: AuthenticatedPrincipal;
  };
};

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const requestIdHeader = req.header('x-request-id');
  const requestId = requestIdHeader && requestIdHeader.length > 0 ? requestIdHeader : undefined;

  const requestWithContext = req as RequestWithContext;
  requestWithContext.context = {
    requestId,
    principal: undefined,
  };

  next();
}

export function hasAuthenticatedPrincipal(req: RequestWithContext): req is AuthenticatedRequest {
  return req.context.principal !== undefined;
}
