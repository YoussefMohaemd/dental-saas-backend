import { model, models, Schema, type Model } from 'mongoose';

import { DOCUMENT_CATEGORIES } from '../../../../domain/entities/dental-data-model';
import { baseSchemaOptions, objectIdRef, requiredTrimmedString } from '../shared-schema';

const documentSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    name: requiredTrimmedString(),
    category: {
      type: String,
      enum: DOCUMENT_CATEGORIES,
      required: true,
    },
    type: requiredTrimmedString(),
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    doctorId: objectIdRef('Doctor', false),
    patientId: objectIdRef('Patient', false),
    clinicId: objectIdRef('Clinic', false),
    orderId: objectIdRef('Order', false),
    subOrderId: objectIdRef('SubOrder', false),
    uploadedBy: objectIdRef('User'),
  },
  {
    ...baseSchemaOptions,
    collection: 'documents',
  },
);

documentSchema.index({ tenantId: 1, category: 1, date: -1 });
documentSchema.index({ tenantId: 1, orderId: 1, subOrderId: 1 });
documentSchema.index({ tenantId: 1, patientId: 1, date: -1 });

export const DocumentModel: Model<any> = (models.Document as Model<any> | undefined) ?? model('Document', documentSchema);












