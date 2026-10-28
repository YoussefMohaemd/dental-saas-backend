import { model, models, Schema, type Model } from 'mongoose';

import { baseSchemaOptions, requiredTrimmedString } from '../shared-schema';

const authRateLimitSchema = new Schema(
  {
    key: {
      ...requiredTrimmedString(),
      unique: true,
    },
    count: {
      type: Number,
      required: true,
      min: 1,
    },
    resetAt: {
      type: Date,
      required: true,
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'authRateLimits',
  },
);

authRateLimitSchema.index({ key: 1 }, { unique: true });
authRateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

export const AuthRateLimitModel: Model<any> =
  (models.AuthRateLimit as Model<any> | undefined) ?? model('AuthRateLimit', authRateLimitSchema);

