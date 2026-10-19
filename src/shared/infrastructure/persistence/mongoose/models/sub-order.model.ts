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
  },
  {
    ...baseSchemaOptions,
    collection: 'subOrders',
  },
);

subOrderSchema.index({ tenantId: 1, orderId: 1, status: 1 });
subOrderSchema.index({ tenantId: 1, priority: 1, dueDate: 1 });

export const SubOrderModel: Model<any> = (models.SubOrder as Model<any> | undefined) ?? model('SubOrder', subOrderSchema);












