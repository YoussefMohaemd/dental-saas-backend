import { model, models, Schema, type InferSchemaType, type Model } from 'mongoose';

import { objectIdRef } from '../../../../../shared/infrastructure/persistence/mongoose/shared-schema';

const assistantCompanyProfileSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    name: { type: String, required: true, trim: true },
    about: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    workingHours: { type: String, default: '', trim: true },
    submissionStandards: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false, collection: 'company_profiles' },
);

assistantCompanyProfileSchema.index({ tenantId: 1 }, { unique: true });

export type AssistantCompanyProfilePersistence = InferSchemaType<
  typeof assistantCompanyProfileSchema
>;

export const AssistantCompanyProfileModel: Model<AssistantCompanyProfilePersistence> =
  (models.AssistantCompanyProfile as Model<AssistantCompanyProfilePersistence> | undefined) ??
  model<AssistantCompanyProfilePersistence>(
    'AssistantCompanyProfile',
    assistantCompanyProfileSchema,
  );
