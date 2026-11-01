import { model, models, Schema, type InferSchemaType, type Model } from 'mongoose';

import { objectIdRef } from '../../../../../shared/infrastructure/persistence/mongoose/shared-schema';

const assistantMessageSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true },
    resultType: { type: String, required: true, trim: true },
    createdAt: { type: Date, required: true },
    metadata: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false },
);

const assistantConversationSchema = new Schema(
  {
    conversationId: { type: String, required: true, trim: true, unique: true },
    tenantId: objectIdRef('Tenant'),
    userId: objectIdRef('User'),
    title: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['active', 'pending_confirmation'],
      required: true,
      default: 'active',
    },
    messages: { type: [assistantMessageSchema], default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
    collection: 'assistant_conversations',
  },
);

assistantConversationSchema.index({ tenantId: 1, userId: 1, updatedAt: -1 });
assistantConversationSchema.index({ createdAt: -1 });

export type AssistantConversationPersistence = InferSchemaType<typeof assistantConversationSchema>;

export const AssistantConversationModel: Model<AssistantConversationPersistence> =
  (models.AssistantConversation as Model<AssistantConversationPersistence> | undefined) ??
  model<AssistantConversationPersistence>('AssistantConversation', assistantConversationSchema);
