import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { env } from '../../../config/env';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { TokenService } from './token-service';

describe('TokenService', () => {
  const tokenService = new TokenService();

  const baseClaims = {
    sub: '507f191e810c19729de860ea',
    tid: '507f191e810c19729de860eb',
    roles: ['admin'],
    tv: 1,
    sid: 'session-1',
  };

  it('accepts access tokens signed with HS256', () => {
    const accessToken = jwt.sign(
      {
        ...baseClaims,
        type: 'access',
      },
      env.AUTH_ACCESS_TOKEN_SECRET,
      {
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
        algorithm: 'HS256',
        expiresIn: 60,
      },
    );

    expect(tokenService.verifyAccessToken(accessToken)).toMatchObject({
      ...baseClaims,
      type: 'access',
    });
  });

  it('rejects access tokens signed with algorithms other than HS256', () => {
    const accessToken = jwt.sign(
      {
        ...baseClaims,
        type: 'access',
      },
      env.AUTH_ACCESS_TOKEN_SECRET,
      {
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
        algorithm: 'HS384',
        expiresIn: 60,
      },
    );

    expect(() => tokenService.verifyAccessToken(accessToken)).toThrowError(ApplicationError);
    expect(() => tokenService.verifyAccessToken(accessToken)).toThrowError(
      expect.objectContaining({
        code: APPLICATION_ERROR_CODES.UNAUTHORIZED,
      }),
    );
  });
});
