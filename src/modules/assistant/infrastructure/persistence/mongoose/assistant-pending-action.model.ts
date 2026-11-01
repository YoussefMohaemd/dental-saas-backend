import { model, models, Schema, type InferSchemaType, type Model } from 'mongoose';

import { objectIdRef } from '../../../../../shared/infrastructure/persistence/mongoose/shared-schema';

const assistantPendingActionSchema = new Schema(
  {
    actionId: { type: String, required: true, unique: true, trim: true },
    conversationId: { type: String, required: true, trim: true },
    tenantId: objectIdRef('Tenant'),
    userId: objectIdRef('User'),
    toolName: { type: String, required: true, trim: true },
    payload: { type: Schema.Types.Mixed, required: true },
    confirmationTokenHash: { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: undefined },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'expired'],
      required: true,
      default: 'pending',
    },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
    collection: 'assistant_pending_actions',
  },
);

assistantPendingActionSchema.index({ tenantId: 1, userId: 1, status: 1, createdAt: -1 });
assistantPendingActionSchema.index({ conversationId: 1, createdAt: -1 });
assistantPendingActionSchema.index({ expiresAt: 1 });

export type AssistantPendingActionPersistence = InferSchemaType<typeof assistantPendingActionSchema>;

export const AssistantPendingActionModel: Model<AssistantPendingActionPersistence> =
  (models.AssistantPendingAction as Model<AssistantPendingActionPersistence> | undefined) ??
  model<AssistantPendingActionPersistence>('AssistantPendingAction', assistantPendingActionSchema);
