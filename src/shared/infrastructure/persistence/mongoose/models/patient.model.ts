import { model, models, Schema, type Model } from 'mongoose';

import { ENTITY_ACTIVITY_STATUSES } from '../../../../domain/entities/dental-data-model';
import { baseSchemaOptions, objectIdRef, requiredTrimmedString } from '../shared-schema';

const patientSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    name: requiredTrimmedString(),
    dob: {
      type: Date,
      required: true,
    },
    gender: {
      type: String,
      enum: ['M', 'F'],
      required: true,
    },
    phone: requiredTrimmedString(),
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    clinicId: objectIdRef('Clinic'),
    doctorId: objectIdRef('Doctor'),
    status: {
      type: String,
      enum: ENTITY_ACTIVITY_STATUSES,
      required: true,
      default: 'Active',
    },
    lastVisit: {
      type: Date,
      required: true,
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'patients',
  },
);

patientSchema.index({ tenantId: 1, clinicId: 1, doctorId: 1 });
patientSchema.index({ tenantId: 1, status: 1, lastVisit: -1 });
patientSchema.index({ tenantId: 1, name: 1 });

export const PatientModel: Model<any> = (models.Patient as Model<any> | undefined) ?? model('Patient', patientSchema);












