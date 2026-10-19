import { model, models, Schema, type Model } from 'mongoose';

import { NOTIFICATION_TYPES } from '../../../../domain/entities/dental-data-model';
import { baseSchemaOptions, objectIdRef, requiredTrimmedString } from '../shared-schema';

const notificationSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    recipientId: objectIdRef('User'),
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: requiredTrimmedString(),
    message: requiredTrimmedString(),
    read: {
      type: Boolean,
      required: true,
      default: false,
    },
    relatedId: {
      type: Schema.Types.ObjectId,
    },
    relatedType: {
      type: String,
      trim: true,
    },
  },
  {
    ...baseSchemaOptions,
    collection: 'notifications',
  },
);

notificationSchema.index({ tenantId: 1, recipientId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, type: 1, createdAt: -1 });

export const NotificationModel: Model<any> = (models.Notification as Model<any> | undefined) ?? model('Notification', notificationSchema);












