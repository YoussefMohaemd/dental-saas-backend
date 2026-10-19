import { model, models, Schema, type Model } from 'mongoose';

import { CASE_STATUSES, PRIORITIES } from '../../../../domain/entities/dental-data-model';
import { baseSchemaOptions, objectIdRef, requiredTrimmedString } from '../shared-schema';

const caseSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    caseNumber: requiredTrimmedString(),
    title: requiredTrimmedString(),
    patientId: objectIdRef('Patient'),
    doctorId: objectIdRef('Doctor'),
    clinicId: objectIdRef('Clinic'),
    status: {
      type: String,
      enum: CASE_STATUSES,
      required: true,
      default: 'Open',
    },
    priority: {
      type: String,
      enum: PRIORITIES,
      required: true,
      default: 'Normal',
    },
    ordersCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    filesCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'cases',
  },
);

caseSchema.index({ tenantId: 1, caseNumber: 1 }, { unique: true });
caseSchema.index({ tenantId: 1, status: 1, priority: 1, updatedAt: -1 });
caseSchema.index({ tenantId: 1, patientId: 1, updatedAt: -1 });

export const CaseModel: Model<any> = (models.Case as Model<any> | undefined) ?? model('Case', caseSchema);












