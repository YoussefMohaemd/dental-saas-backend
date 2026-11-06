import { model, models, Schema, type InferSchemaType, type Model } from 'mongoose';

import { objectIdRef } from '../../../../../shared/infrastructure/persistence/mongoose/shared-schema';

const assistantServiceCatalogSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    serviceId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    basePrice: { type: Number, required: true, min: 0 },
    turnaroundDays: { type: Number, required: true, min: 0 },
    scanRequirements: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false, collection: 'service_catalog' },
);

assistantServiceCatalogSchema.index({ tenantId: 1, serviceId: 1 }, { unique: true });

export type AssistantServiceCatalogPersistence = InferSchemaType<
  typeof assistantServiceCatalogSchema
>;

export const AssistantServiceCatalogModel: Model<AssistantServiceCatalogPersistence> =
  (models.AssistantServiceCatalog as Model<AssistantServiceCatalogPersistence> | undefined) ??
  model<AssistantServiceCatalogPersistence>(
    'AssistantServiceCatalog',
    assistantServiceCatalogSchema,
  );
