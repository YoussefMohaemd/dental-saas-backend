import { model, models, Schema, type Model } from 'mongoose';

import { baseSchemaOptions, objectIdRef } from '../shared-schema';

const notificationPreferencesSchema = new Schema(
  {
    orderUpdates: { type: Boolean, default: true },
    changeRequests: { type: Boolean, default: true },
    billingAlerts: { type: Boolean, default: true },
    systemAlerts: { type: Boolean, default: false },
    weeklySummary: { type: Boolean, default: true },
  },
  { _id: false },
);

const userPreferencesSchema = new Schema(
  {
    tenantId: objectIdRef('Tenant'),
    userId: objectIdRef('User'),
    density: { type: String, enum: ['Compact', 'Default', 'Comfortable'], default: 'Default' },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    language: { type: String, default: 'en', trim: true },
    timeZone: { type: String, default: 'UTC', trim: true },
    dateFormat: { type: String, default: 'YYYY-MM-DD', trim: true },
    notificationPrefs: { type: notificationPreferencesSchema, default: () => ({}) },
  },
  baseSchemaOptions,
);

userPreferencesSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

export const UserPreferencesModel: Model<any> =
  (models.UserPreferences as Model<any> | undefined) ??
  model('UserPreferences', userPreferencesSchema);
