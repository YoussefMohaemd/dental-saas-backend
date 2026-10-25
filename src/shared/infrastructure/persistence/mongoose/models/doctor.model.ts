import { model, models, Schema, type Model } from 'mongoose';

import { ENTITY_ACTIVITY_STATUSES } from '../../../../domain/entities/dental-data-model';
import { baseSchemaOptions, objectIdRef, requiredTrimmedString } from '../shared-schema';

const doctorSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    lookupId: {
      type: String,
      trim: true,
    },
    name: requiredTrimmedString(),
    gender: {
      type: String,
      enum: ['M', 'F'],
      default: 'M',
    },
    specialty: requiredTrimmedString(),
    clinicId: objectIdRef('Clinic'),
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: requiredTrimmedString(),
    status: {
      type: String,
      enum: ENTITY_ACTIVITY_STATUSES,
      required: true,
      default: 'Active',
    },
    joinedDate: {
      type: Date,
      required: true,
    },
    avatar: {
      type: String,
      default: '',
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'doctors',
  },
);

doctorSchema.index({ tenantId: 1, clinicId: 1, status: 1 });
doctorSchema.index({ tenantId: 1, lookupId: 1 }, { unique: true, sparse: true });
doctorSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const DoctorModel: Model<any> =
  (models.Doctor as Model<any> | undefined) ?? model('Doctor', doctorSchema);
