import { model, models, Schema, type Model } from 'mongoose';

import { BILLING_STATUSES } from '../../../../domain/entities/dental-data-model';
import { baseSchemaOptions, objectIdRef } from '../shared-schema';

const billingRecordSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    orderId: objectIdRef('Order'),
    patientId: objectIdRef('Patient'),
    doctorId: objectIdRef('Doctor'),
    clinicId: objectIdRef('Clinic'),
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: BILLING_STATUSES,
      required: true,
      default: 'Pending',
    },
    invoiceNumber: {
      type: String,
      trim: true,
    },
    invoiceDate: Date,
    dueDate: {
      type: Date,
      required: true,
    },
    paidDate: Date,
    vouchers: {
      type: Number,
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
    collection: 'billingRecords',
  },
);

billingRecordSchema.index({ tenantId: 1, orderId: 1 }, { unique: true });
billingRecordSchema.index({ tenantId: 1, status: 1, dueDate: 1 });
billingRecordSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });

export const BillingRecordModel: Model<any> = (models.BillingRecord as Model<any> | undefined) ?? model('BillingRecord', billingRecordSchema);












