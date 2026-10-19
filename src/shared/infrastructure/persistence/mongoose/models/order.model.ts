import { model, models, Schema, type Model } from 'mongoose';

import {
  ARCH_TYPES,
  ORDER_STATUSES,
  PRIORITIES,
  RESTORATIVE_TYPES,
} from '../../../../domain/entities/dental-data-model';
import { baseSchemaOptions, objectIdRef, requiredTrimmedString } from '../shared-schema';

const subOrderCreationSchema = new Schema(
  {
    serviceId: requiredTrimmedString(),
    serviceDetails: {
      type: Map,
      of: String,
      default: {},
    },
    serviceForm: {
      type: Map,
      of: String,
      default: {},
    },
    selectedTeeth: {
      type: [Number],
      default: [],
    },
    scanRequirements: {
      type: [String],
      default: [],
    },
    fileReferences: {
      type: [String],
      default: [],
    },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    orderNumber: requiredTrimmedString(),
    patientId: objectIdRef('Patient'),
    doctorId: objectIdRef('Doctor'),
    clinicId: objectIdRef('Clinic'),
    scanCenterId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      required: true,
      default: 'New',
    },
    priority: {
      type: String,
      enum: PRIORITIES,
      required: true,
      default: 'Normal',
    },
    restoration: {
      type: String,
      enum: RESTORATIVE_TYPES,
      required: true,
    },
    arch: {
      type: String,
      enum: ARCH_TYPES,
      required: true,
    },
    format: requiredTrimmedString(),
    shade: requiredTrimmedString(),
    units: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    billed: {
      type: Boolean,
      default: false,
      required: true,
    },
    billedAmount: {
      type: Number,
      min: 0,
    },
    billTo: requiredTrimmedString(),
    vouchers: {
      type: Number,
      default: 0,
      min: 0,
    },
    isLocked: {
      type: Boolean,
      default: false,
      required: true,
    },
    hasNotes: {
      type: Boolean,
      default: false,
      required: true,
    },
    notes: {
      type: String,
      default: '',
    },
    archiveDate: Date,
    receivedAt: {
      type: Date,
      required: true,
    },
    sentAt: Date,
    chargedAt: Date,
    dueDate: {
      type: Date,
      required: true,
    },
    changeRequestId: objectIdRef('ChangeRequest', false),
    csTask: {
      type: String,
      trim: true,
    },
    technicianId: objectIdRef('User', false),
    creationData: {
      services: {
        type: [subOrderCreationSchema],
        default: [],
      },
      communication: {
        internalCaseNote: {
          type: String,
          default: '',
        },
        internalCaseFiles: {
          type: [String],
          default: [],
        },
        sendMailTo: {
          type: [String],
          default: [],
        },
        sendIhTaskTo: String,
        rushTask: {
          type: Boolean,
          default: false,
        },
      },
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'orders',
  },
);

orderSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ tenantId: 1, status: 1, priority: 1, dueDate: 1 });
orderSchema.index({ tenantId: 1, patientId: 1, receivedAt: -1 });
orderSchema.index({ tenantId: 1, clinicId: 1, updatedAt: -1 });
orderSchema.index({ tenantId: 1, technicianId: 1, status: 1 });

export const OrderModel: Model<any> = (models.Order as Model<any> | undefined) ?? model('Order', orderSchema);











