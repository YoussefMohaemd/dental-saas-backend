import { model, models, Schema, type Model } from 'mongoose';

import { PRIORITIES, SUB_ORDER_STATUSES } from '../../../../domain/entities/dental-data-model';
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

const subOrderFormValueSchema = new Schema(
  {
    values: {
      type: Map,
      of: String,
      default: {},
    },
    context: {
      type: Schema.Types.Mixed,
      default: {},
    },
    updatedAt: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const subOrderFormSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Boolean, required: true },
    status: {
      type: String,
      enum: ['complete', 'incomplete', 'optional'],
      required: true,
    },
    value: subOrderFormValueSchema,
  },
  { _id: false },
);

const subOrderScanFileSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    sizeLabel: { type: String, required: true },
    type: { type: String, required: true },
    lastModified: { type: Number, required: true },
    selectedAt: { type: String, required: true },
  },
  { _id: false },
);

const subOrderScanSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    format: { type: String, required: true },
    status: {
      type: String,
      enum: ['uploaded', 'missing', 'optional', 'selected-local'],
      required: true,
    },
    localFiles: {
      type: [subOrderScanFileSchema],
      default: undefined,
    },
    updatedAt: { type: String },
  },
  { _id: false },
);

const subOrderActivitySchema = new Schema(
  {
    time: { type: String, required: true },
    user: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false },
);

const subOrderSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    orderId: objectIdRef('Order'),
    service: requiredTrimmedString(),
    icon: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: SUB_ORDER_STATUSES,
      required: true,
      default: 'pending',
    },
    formsComplete: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    formsTotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    scansComplete: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    scansTotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    teeth: {
      type: [Number],
      default: [],
    },
    priority: {
      type: String,
      enum: PRIORITIES,
      required: true,
      default: 'Normal',
    },
    dueDate: {
      type: Date,
      required: true,
    },
    notes: {
      type: String,
      default: '',
    },
    creationData: subOrderCreationSchema,
    forms: {
      type: [subOrderFormSchema],
      default: undefined,
    },
    scans: {
      type: [subOrderScanSchema],
      default: undefined,
    },
    activity: {
      type: [subOrderActivitySchema],
      default: undefined,
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'subOrders',
  },
);

subOrderSchema.index({ tenantId: 1, orderId: 1, status: 1 });
subOrderSchema.index({ tenantId: 1, priority: 1, dueDate: 1 });

export const SubOrderModel: Model<any> = (models.SubOrder as Model<any> | undefined) ?? model('SubOrder', subOrderSchema);











