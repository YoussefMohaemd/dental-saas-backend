import crypto from 'crypto';

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { env } from '../../../config/env';
import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';

export interface AuthTokenClaims {
  sub: string;
  tid: string;
  roles: string[];
  tv: number;
  sid: string;
}

export interface RefreshTokenClaims extends AuthTokenClaims {
  jti: string;
  type: 'refresh';
}

export interface AccessTokenClaims extends AuthTokenClaims {
  type: 'access';
}

interface SignedTokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
}

export class TokenService {
  public signTokenPair(claims: AuthTokenClaims): SignedTokenPair {
    const refreshTokenId = crypto.randomUUID();
    const accessToken = jwt.sign(
      {
        sub: claims.sub,
        tid: claims.tid,
        roles: claims.roles,
        tv: claims.tv,
        sid: claims.sid,
        type: 'access',
      } satisfies AccessTokenClaims,
      env.AUTH_ACCESS_TOKEN_SECRET,
      {
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
        expiresIn: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    const refreshToken = jwt.sign(
      {
        sub: claims.sub,
        tid: claims.tid,
        roles: claims.roles,
        tv: claims.tv,
        sid: claims.sid,
        type: 'refresh',
      } satisfies Omit<RefreshTokenClaims, 'jti'>,
      env.AUTH_REFRESH_TOKEN_SECRET,
      {
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
        jwtid: refreshTokenId,
        expiresIn: env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
      },
    );

    return { accessToken, refreshToken, refreshTokenId };
  }

  public verifyAccessToken(token: string): AccessTokenClaims {
    const payload = this.verifyAndNormalizePayload(token, env.AUTH_ACCESS_TOKEN_SECRET);

    if (payload.type !== 'access') {
      throw this.createUnauthorizedError('Invalid access token type');
    }

    return payload as AccessTokenClaims;
  }

  public verifyRefreshToken(token: string): RefreshTokenClaims {
    const payload = this.verifyAndNormalizePayload(token, env.AUTH_REFRESH_TOKEN_SECRET);

    if (payload.type !== 'refresh') {
      throw this.createUnauthorizedError('Invalid refresh token type');
    }

    if (typeof payload.jti !== 'string' || payload.jti.length < 1) {
      throw this.createUnauthorizedError('Refresh token id is missing');
    }

    return payload as RefreshTokenClaims;
  }

  private verifyAndNormalizePayload(token: string, secret: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, secret, {
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
      });

      if (typeof decoded === 'string') {
        throw this.createUnauthorizedError('Token payload has invalid format');
      }

      this.validatePayload(decoded);
      return decoded;
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      throw this.createUnauthorizedError('Invalid or expired token');
    }
  }

  private validatePayload(payload: JwtPayload): void {
    if (typeof payload.sub !== 'string' || payload.sub.length < 1) {
      throw this.createUnauthorizedError('Token subject is missing');
    }

    if (typeof payload.tid !== 'string' || payload.tid.length < 1) {
      throw this.createUnauthorizedError('Token tenant is missing');
    }

    if (!Array.isArray(payload.roles) || payload.roles.some((role) => typeof role !== 'string')) {
      throw this.createUnauthorizedError('Token roles are invalid');
    }

    if (typeof payload.tv !== 'number' || payload.tv < 0) {
      throw this.createUnauthorizedError('Token version is invalid');
    }

    if (typeof payload.sid !== 'string' || payload.sid.length < 1) {
      throw this.createUnauthorizedError('Token session is missing');
    }

    if (payload.type !== 'access' && payload.type !== 'refresh') {
      throw this.createUnauthorizedError('Token type is invalid');
    }
  }

  private createUnauthorizedError(message: string): ApplicationError {
    return new ApplicationError({
      message,
      statusCode: 401,
      code: APPLICATION_ERROR_CODES.UNAUTHORIZED,
      expose: true,
    });
  }
}
