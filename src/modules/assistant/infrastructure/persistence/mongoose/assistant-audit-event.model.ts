import { model, models, Schema, type InferSchemaType, type Model } from 'mongoose';

import { objectIdRef } from '../../../../../shared/infrastructure/persistence/mongoose/shared-schema';

const assistantAuditEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, trim: true },
    tenantId: objectIdRef('Tenant'),
    userId: objectIdRef('User'),
    conversationId: { type: String, trim: true },
    messageId: { type: String, trim: true },
    actionId: { type: String, trim: true },
    eventType: {
      type: String,
      enum: [
        'assistant.message.received',
        'assistant.message.responded',
        'assistant.confirmation.created',
        'assistant.confirmation.accepted',
        'assistant.permission.denied',
      ],
      required: true,
    },
    status: { type: String, enum: ['success', 'denied', 'failed'], required: true },
    details: { type: Schema.Types.Mixed, default: undefined },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
    collection: 'assistant_audit_events',
  },
);

assistantAuditEventSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
assistantAuditEventSchema.index({ conversationId: 1, createdAt: -1 });

export type AssistantAuditEventPersistence = InferSchemaType<typeof assistantAuditEventSchema>;

export const AssistantAuditEventModel: Model<AssistantAuditEventPersistence> =
  (models.AssistantAuditEvent as Model<AssistantAuditEventPersistence> | undefined) ??
  model<AssistantAuditEventPersistence>('AssistantAuditEvent', assistantAuditEventSchema);
