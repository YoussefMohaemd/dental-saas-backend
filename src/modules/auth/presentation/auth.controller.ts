import { type CookieOptions, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { env } from '../../../config/env';
import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';
import { sendNoContent, sendOk } from '../../../shared/presentation/http/api-response';
import { objectIdSchema } from '../../../shared/presentation/http/http-utils';
import { type AuthenticatedRequest } from '../../../shared/presentation/http/request-context';
import { AuthService } from '../application/auth-service';

const authService = new AuthService();

const loginSchema = z.object({
  tenantId: objectIdSchema,
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  rememberMe: z.boolean().optional(),
}).strict();

const refreshCookieSchema = z.string().min(1);
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

const refreshCookieOptions: CookieOptions = {
  httpOnly: env.AUTH_REFRESH_COOKIE_HTTP_ONLY,
  secure: env.AUTH_REFRESH_COOKIE_SECURE,
  sameSite: env.AUTH_REFRESH_COOKIE_SAME_SITE,
  domain: env.AUTH_REFRESH_COOKIE_DOMAIN,
  path: env.AUTH_REFRESH_COOKIE_PATH,
};

const clearRefreshCookieOptions: CookieOptions = {
  ...refreshCookieOptions,
  maxAge: 0,
};

export async function loginController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = loginSchema.parse(req.body);
    const sessionContext = getSessionContext(req);
    const authResult = await authService.login({
      tenantId: payload.tenantId,
      email: payload.email,
      password: payload.password,
      rememberMe: payload.rememberMe ?? true,
      ...sessionContext,
    });

    res.cookie(
      env.AUTH_REFRESH_COOKIE_NAME,
      authResult.refreshToken,
      buildRefreshCookieOptions(authResult.refreshTokenPersistent),
    );
    sendOk(res, {
      accessToken: authResult.accessToken,
      user: authResult.user,
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = getRefreshTokenFromCookie(req);
    const authResult = await authService.refresh(refreshToken, getSessionContext(req));

    res.cookie(
      env.AUTH_REFRESH_COOKIE_NAME,
      authResult.refreshToken,
      buildRefreshCookieOptions(authResult.refreshTokenPersistent),
    );
    sendOk(res, {
      accessToken: authResult.accessToken,
      user: authResult.user,
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies[env.AUTH_REFRESH_COOKIE_NAME] as unknown;
    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      await authService.logout(refreshToken);
    }

    res.clearCookie(env.AUTH_REFRESH_COOKIE_NAME, clearRefreshCookieOptions);
    sendNoContent(res);
  } catch (error) {
    next(error);
  }
}

export async function getCurrentUserController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authenticatedRequest = req as AuthenticatedRequest;
    const principal = authenticatedRequest.context.principal;
    sendOk(
      res,
      await authService.getCurrentUser(principal.userId, principal.tenantId),
    );
  } catch (error) {
    next(error);
  }
}

export async function changePasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authenticatedRequest = req as AuthenticatedRequest;
    const principal = authenticatedRequest.context.principal;
    const payload = changePasswordSchema.parse(req.body);
    await authService.changePassword({
      ...payload,
      userId: principal.userId,
      tenantId: principal.tenantId,
    });
    res.clearCookie(env.AUTH_REFRESH_COOKIE_NAME, clearRefreshCookieOptions);
    sendNoContent(res);
  } catch (error) {
    next(error);
  }
}

export async function revokeSessionsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authenticatedRequest = req as AuthenticatedRequest;
    await authService.revokeAllUserSessions(
      authenticatedRequest.context.principal.userId,
      authenticatedRequest.context.principal.tenantId,
    );
    res.clearCookie(env.AUTH_REFRESH_COOKIE_NAME, clearRefreshCookieOptions);
    sendNoContent(res);
  } catch (error) {
    next(error);
  }
}

function getRefreshTokenFromCookie(req: Request): string {
  const refreshToken = req.cookies[env.AUTH_REFRESH_COOKIE_NAME] as unknown;
  const parsed = refreshCookieSchema.safeParse(refreshToken);

  if (!parsed.success) {
    throw new ApplicationError({
      message: 'Refresh token cookie is missing',
      statusCode: 401,
      code: APPLICATION_ERROR_CODES.UNAUTHORIZED,
      expose: true,
    });
  }

  return parsed.data;
}

function getSessionContext(req: Request): { ipAddress: string | undefined; userAgent: string | undefined } {
  const forwardedFor = req.header('x-forwarded-for');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() ?? req.ip;
  const userAgent = req.header('user-agent') ?? undefined;

  return {
    ipAddress: ipAddress || undefined,
    userAgent,
  };
}

function buildRefreshCookieOptions(isPersistent: boolean): CookieOptions {
  return {
    ...refreshCookieOptions,
    ...(isPersistent ? { maxAge: env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000 } : {}),
  };
}
