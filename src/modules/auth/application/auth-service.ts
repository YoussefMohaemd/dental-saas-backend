import mongoose from 'mongoose';

import { env } from '../../../config/env';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { AuthSessionModel } from '../../../shared/infrastructure/persistence/mongoose/models/auth-session.model';
import { UserModel } from '../../../shared/infrastructure/persistence/mongoose/models/user.model';
import { resolveRoleCapabilities, type DentalCapability } from './authorization-policy';
import { PasswordHasher } from './password-hasher';
import { type AuthTokenClaims, TokenService } from './token-service';

interface LoginInput {
  tenantId: string;
  email: string;
  password: string;
  ipAddress: string | undefined;
  userAgent: string | undefined;
}

interface SessionContext {
  ipAddress: string | undefined;
  userAgent: string | undefined;
}

interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  fullName: string;
  email: string;
  roles: string[];
  capabilities: DentalCapability[];
  clinicId?: string;
  avatarUrl?: string;
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

const passwordHasher = new PasswordHasher();
const tokenService = new TokenService();
interface UserWithAuth {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  fullName: string;
  email: string;
  roles: string[];
  passwordHash?: string;
  status: string;
  tokenVersion: number;
  clinicId?: mongoose.Types.ObjectId;
  avatarUrl?: string;
}

interface AuthSessionRecord {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  currentTokenId: string;
  refreshTokenHash: string;
  userAgent?: string;
  ipAddress?: string;
  revokedAt?: Date;
  replacedByTokenId?: string;
  lastUsedAt?: Date;
  expiresAt: Date;
}

const userModel = UserModel as mongoose.Model<UserWithAuth>;
const authSessionModel = AuthSessionModel as mongoose.Model<AuthSessionRecord>;

export class AuthService {
  public async getCurrentUser(userId: string, tenantId: string): Promise<AuthenticatedUser> {
    const user = await userModel
      .findOne({ _id: userId, tenantId, status: 'active' })
      .lean<UserWithAuth>()
      .exec();

    if (!user) {
      throw this.createUnauthorizedError('User no longer exists');
    }

    return this.toAuthenticatedUser(user);
  }

  public async changePassword(input: {
    userId: string;
    tenantId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const user = await userModel
      .findOne({
        _id: input.userId,
        tenantId: input.tenantId,
        status: 'active',
      })
      .select('+passwordHash')
      .lean<UserWithAuth>()
      .exec();

    if (!user?.passwordHash) {
      throw this.createUnauthorizedError('User no longer exists');
    }

    const currentPasswordMatches = await passwordHasher.verify(
      user.passwordHash,
      input.currentPassword,
    );
    if (!currentPasswordMatches) {
      throw this.createUnauthorizedError('Current password is incorrect');
    }

    const passwordHash = await passwordHasher.hash(input.newPassword);
    await userModel
      .updateOne({ _id: user._id, tenantId: user.tenantId }, { $set: { passwordHash } })
      .exec();
  }

  public async login(input: LoginInput): Promise<AuthTokensResponse> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await userModel
      .findOne({
        tenantId: input.tenantId,
        email: normalizedEmail,
      })
      .select('+passwordHash')
      .lean<UserWithAuth>()
      .exec();

    if (!user?.passwordHash) {
      throw this.createUnauthorizedError('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw this.createForbiddenError('User account is not active');
    }

    const passwordMatches = await passwordHasher.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      throw this.createUnauthorizedError('Invalid email or password');
    }

    await userModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).exec();

    return this.issueSessionTokens(user, {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }

  public async refresh(
    refreshToken: string,
    sessionContext: SessionContext,
  ): Promise<AuthTokensResponse> {
    const refreshClaims = tokenService.verifyRefreshToken(refreshToken);
    const user = await this.getActiveUser(refreshClaims.sub, refreshClaims.tid);
    this.ensureTokenVersion(user, refreshClaims.tv);

    const session = await authSessionModel
      .findOne({
        _id: refreshClaims.sid,
        userId: user._id,
        tenantId: user.tenantId,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .select('+refreshTokenHash')
      .exec();

    if (!session) {
      throw this.createUnauthorizedError('Session is not valid');
    }

    if (session.currentTokenId !== refreshClaims.jti) {
      throw this.createUnauthorizedError('Refresh token was rotated');
    }

    const tokenMatches = await passwordHasher.verify(session.refreshTokenHash, refreshToken);
    if (!tokenMatches) {
      throw this.createUnauthorizedError('Refresh token mismatch');
    }

    const tokenPair = tokenService.signTokenPair(this.toClaims(user, session._id.toString()));
    const refreshTokenHash = await passwordHasher.hash(tokenPair.refreshToken);

    session.currentTokenId = tokenPair.refreshTokenId;
    session.refreshTokenHash = refreshTokenHash;
    session.replacedByTokenId = tokenPair.refreshTokenId;
    session.lastUsedAt = new Date();
    session.expiresAt = new Date(Date.now() + env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000);
    if (sessionContext.userAgent) {
      session.userAgent = sessionContext.userAgent;
    }
    if (sessionContext.ipAddress) {
      session.ipAddress = sessionContext.ipAddress;
    }
    await session.save();

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      user: this.toAuthenticatedUser(user),
    };
  }

  public async logout(refreshToken: string): Promise<void> {
    try {
      const refreshClaims = tokenService.verifyRefreshToken(refreshToken);

      await authSessionModel
        .updateOne(
          {
            _id: refreshClaims.sid,
            currentTokenId: refreshClaims.jti,
            revokedAt: { $exists: false },
          },
          {
            $set: {
              revokedAt: new Date(),
            },
            $unset: { replacedByTokenId: '' },
          },
        )
        .exec();
    } catch {
      return;
    }
  }

  public async revokeAllUserSessions(userId: string, tenantId: string): Promise<void> {
    const now = new Date();
    const updateResult = await userModel
      .updateOne({ _id: userId, tenantId, status: 'active' }, { $inc: { tokenVersion: 1 } })
      .exec();

    if (updateResult.matchedCount === 0) {
      throw this.createUnauthorizedError('User no longer exists');
    }

    await authSessionModel
      .updateMany({ userId, tenantId, revokedAt: { $exists: false } }, { $set: { revokedAt: now } })
      .exec();
  }

  private async issueSessionTokens(
    user: UserWithAuth,
    context: SessionContext,
  ): Promise<AuthTokensResponse> {
    const now = new Date();
    await authSessionModel
      .deleteMany({
        tenantId: user.tenantId,
        $or: [{ revokedAt: { $exists: true } }, { expiresAt: { $lte: now } }],
      })
      .exec();

    const sessionQuery = {
      userId: user._id,
      tenantId: user.tenantId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
      ...(context.userAgent
        ? { userAgent: context.userAgent }
        : { $or: [{ userAgent: { $exists: false } }, { userAgent: null }] }),
    };
    const existingSession = await authSessionModel
      .findOne(sessionQuery)
      .select('+refreshTokenHash')
      .exec();
    const sessionId = existingSession?._id.toString() ?? new mongoose.Types.ObjectId().toString();
    const tokenPair = tokenService.signTokenPair(this.toClaims(user, sessionId));
    const refreshTokenHash = await passwordHasher.hash(tokenPair.refreshToken);

    if (existingSession) {
      existingSession.currentTokenId = tokenPair.refreshTokenId;
      existingSession.refreshTokenHash = refreshTokenHash;
      if (context.userAgent) {
        existingSession.userAgent = context.userAgent;
      }
      if (context.ipAddress) {
        existingSession.ipAddress = context.ipAddress;
      }
      existingSession.expiresAt = new Date(Date.now() + env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000);
      existingSession.lastUsedAt = now;
      existingSession.set({ replacedByTokenId: undefined });
      await existingSession.save();
    } else {
      await authSessionModel.create({
        _id: sessionId,
        userId: user._id,
        tenantId: user.tenantId,
        currentTokenId: tokenPair.refreshTokenId,
        refreshTokenHash,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt: new Date(Date.now() + env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000),
        lastUsedAt: now,
      });
    }

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      user: this.toAuthenticatedUser(user),
    };
  }

  private async getActiveUser(userId: string, tenantId: string): Promise<UserWithAuth> {
    const user = await userModel
      .findOne({
        _id: userId,
        tenantId,
        status: 'active',
      })
      .lean<UserWithAuth>()
      .exec();

    if (!user) {
      throw this.createUnauthorizedError('User not found');
    }

    return user;
  }

  private toAuthenticatedUser(user: UserWithAuth): AuthenticatedUser {
    return {
      userId: user._id.toString(),
      tenantId: user.tenantId.toString(),
      fullName: user.fullName,
      email: user.email,
      roles: user.roles,
      capabilities: resolveRoleCapabilities(user.roles),
      ...(user.clinicId ? { clinicId: user.clinicId.toString() } : {}),
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    };
  }

  private toClaims(user: UserWithAuth, sessionId: string): AuthTokenClaims {
    return {
      sub: user._id.toString(),
      tid: user.tenantId.toString(),
      roles: user.roles,
      tv: user.tokenVersion,
      sid: sessionId,
    };
  }

  private ensureTokenVersion(user: UserWithAuth, tokenVersion: number): void {
    if (user.tokenVersion !== tokenVersion) {
      throw this.createUnauthorizedError('Token has been revoked');
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

  private createForbiddenError(message: string): ApplicationError {
    return new ApplicationError({
      message,
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      expose: true,
    });
  }
}
