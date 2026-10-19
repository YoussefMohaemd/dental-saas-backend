import { model, models, Schema, type Model } from 'mongoose';

import { ENTITY_ACTIVITY_STATUSES } from '../../../../domain/entities/dental-data-model';
import { baseSchemaOptions, objectIdRef, requiredTrimmedString } from '../shared-schema';

const clinicSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    name: requiredTrimmedString(),
    address: requiredTrimmedString(),
    city: requiredTrimmedString(),
    phone: requiredTrimmedString(),
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ENTITY_ACTIVITY_STATUSES,
      required: true,
      default: 'Active',
    },
    accountManager: requiredTrimmedString(),
  },
  {
    ...baseSchemaOptions,
    collection: 'clinics',
  },
);

clinicSchema.index({ tenantId: 1, name: 1 }, { unique: true });
clinicSchema.index({ tenantId: 1, status: 1, city: 1 });

export const ClinicModel: Model<any> = (models.Clinic as Model<any> | undefined) ?? model('Clinic', clinicSchema);












