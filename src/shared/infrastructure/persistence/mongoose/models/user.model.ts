import { model, models, Schema, type Model } from 'mongoose';

import { USER_STATUSES } from '../../../../domain/entities/dental-data-model';
import { baseSchemaOptions, objectIdRef, requiredTrimmedString } from '../shared-schema';

const userSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    fullName: requiredTrimmedString(),
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      trim: true,
      select: false,
    },
    roles: {
      type: [String],
      required: true,
      default: [],
    },
    clinicId: objectIdRef('Clinic', false),
    avatarUrl: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: 'active',
      required: true,
    },
    lastLoginAt: Date,
    tokenVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'users',
  },
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, status: 1 });

export const UserModel: Model<any> = (models.User as Model<any> | undefined) ?? model('User', userSchema);











