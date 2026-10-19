import { model, models, Schema, type Model } from 'mongoose';

import {
  CHANGE_REQUEST_STATUSES,
  PRIORITIES,
} from '../../../../domain/entities/dental-data-model';
import { baseSchemaOptions, objectIdRef, requiredTrimmedString } from '../shared-schema';

const changeRequestSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    requestNumber: requiredTrimmedString(),
    orderId: objectIdRef('Order'),
    requesterId: objectIdRef('User'),
    assigneeId: objectIdRef('User', false),
    status: {
      type: String,
      enum: CHANGE_REQUEST_STATUSES,
      required: true,
      default: 'Pending',
    },
    priority: {
      type: String,
      enum: PRIORITIES,
      required: true,
      default: 'Normal',
    },
    description: requiredTrimmedString(),
    resolutionNote: {
      type: String,
      trim: true,
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'changeRequests',
  },
);

changeRequestSchema.index({ tenantId: 1, requestNumber: 1 }, { unique: true });
changeRequestSchema.index({ tenantId: 1, orderId: 1, createdAt: -1 });
changeRequestSchema.index({ tenantId: 1, status: 1, priority: 1, updatedAt: -1 });

export const ChangeRequestModel: Model<any> = (models.ChangeRequest as Model<any> | undefined) ?? model('ChangeRequest', changeRequestSchema);












