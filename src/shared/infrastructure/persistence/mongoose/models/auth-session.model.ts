import { model, models, Schema, type Model } from 'mongoose';

import { baseSchemaOptions, objectIdRef } from '../shared-schema';

const authSessionSchema = new Schema(
  {
    userId: objectIdRef('User'),
    tenantId: objectIdRef('Tenant'),
    currentTokenId: {
      type: String,
      required: true,
      trim: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
      trim: true,
      select: false,
    },
    userAgent: {
      type: String,
      trim: true,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    isPersistent: {
      type: Boolean,
      required: true,
      default: false,
    },
    revokedAt: Date,
    replacedByTokenId: {
      type: String,
      trim: true,
    },
    lastUsedAt: Date,
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'authSessions',
  },
);

authSessionSchema.index({ currentTokenId: 1 }, { unique: true });
authSessionSchema.index({ userId: 1, revokedAt: 1 });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSessionModel: Model<any> = (models.AuthSession as Model<any> | undefined) ?? model('AuthSession', authSessionSchema);










