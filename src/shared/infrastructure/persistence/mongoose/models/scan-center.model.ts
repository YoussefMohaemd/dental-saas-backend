import { model, models, Schema, type Model } from 'mongoose';

import { baseSchemaOptions, objectIdRef, requiredTrimmedString } from '../shared-schema';

const scanCenterSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    externalId: requiredTrimmedString(),
    name: requiredTrimmedString(),
    location: requiredTrimmedString(),
    operator: requiredTrimmedString(),
    devices: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['Operational', 'Maintenance'],
      required: true,
      default: 'Operational',
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'scan_centers',
  },
);

scanCenterSchema.index({ tenantId: 1, externalId: 1 }, { unique: true });
scanCenterSchema.index({ tenantId: 1, status: 1, name: 1 });

export const ScanCenterModel: Model<any> =
  (models.ScanCenter as Model<any> | undefined) ?? model('ScanCenter', scanCenterSchema);
