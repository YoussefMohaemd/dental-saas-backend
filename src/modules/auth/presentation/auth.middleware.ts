import type { NextFunction, Request, Response } from 'express';
import type mongoose from 'mongoose';

import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';
import { UserModel } from '../../../shared/infrastructure/persistence/mongoose/models/user.model';
import { type RequestWithContext } from '../../../shared/presentation/http/request-context';
import { resolveRoleCapabilities, type DentalCapability } from '../application/authorization-policy';
import { TokenService } from '../application/token-service';

const tokenService = new TokenService();
const userModel = UserModel as mongoose.Model<Record<string, unknown>>;

export async function requireAuthenticated(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = parseBearerToken(req.header('authorization'));
    const claims = tokenService.verifyAccessToken(token);
    const user = await userModel.findOne({
      _id: claims.sub,
      tenantId: claims.tid,
      status: 'active',
    })
      .select({ roles: 1, tokenVersion: 1 })
      .lean<{ roles: string[]; tokenVersion: number }>()
      .exec();

    if (!user) {
      throw unauthorized('User no longer exists');
    }

    if (user.tokenVersion !== claims.tv) {
      throw unauthorized('Token has been revoked');
    }

    const requestWithContext = req as RequestWithContext;
    requestWithContext.context.principal = {
      userId: claims.sub,
      tenantId: claims.tid,
      roles: user.roles,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requireAnyRole(allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const requestWithContext = req as RequestWithContext;
    const principal = requestWithContext.context?.principal;
    if (!principal) {
      next(unauthorized('Authentication is required'));
      return;
    }

    const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role));
    const hasRole = principal.roles.some((role) => normalizedAllowedRoles.includes(normalizeRole(role)));
    if (!hasRole) {
      next(
        new ApplicationError({
          message: 'Insufficient permissions',
          statusCode: 403,
          code: APPLICATION_ERROR_CODES.FORBIDDEN,
          expose: true,
          details: { requiredRoles: allowedRoles },
        }),
      );
      return;
    }

    next();
  };
}

export function requireAnyCapability(requiredCapabilities: DentalCapability[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const requestWithContext = req as RequestWithContext;
    const principal = requestWithContext.context?.principal;
    if (!principal) {
      next(unauthorized('Authentication is required'));
      return;
    }

    const roleCapabilities = new Set(resolveRoleCapabilities(principal.roles));
    const hasAnyRequiredCapability = requiredCapabilities.some((capability) => roleCapabilities.has(capability));
    if (!hasAnyRequiredCapability) {
      next(
        new ApplicationError({
          message: 'Insufficient permissions',
          statusCode: 403,
          code: APPLICATION_ERROR_CODES.FORBIDDEN,
          expose: true,
          details: { requiredCapabilities },
        }),
      );
      return;
    }

    next();
  };
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

function parseBearerToken(headerValue: string | undefined): string {
  if (!headerValue) {
    throw unauthorized('Authorization header is missing');
  }

  const [scheme, token] = headerValue.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw unauthorized('Authorization header must use ******');
  }

  return token;
}

function unauthorized(message: string): ApplicationError {
  return new ApplicationError({
    message,
    statusCode: 401,
    code: APPLICATION_ERROR_CODES.UNAUTHORIZED,
    expose: true,
  });
}
