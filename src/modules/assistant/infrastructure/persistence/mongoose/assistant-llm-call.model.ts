import { model, models, Schema, type InferSchemaType, type Model } from 'mongoose';

import { objectIdRef } from '../../../../../shared/infrastructure/persistence/mongoose/shared-schema';

const assistantLlmCallSchema = new Schema(
  {
    callId: { type: String, required: true, unique: true, trim: true },
    tenantId: objectIdRef('Tenant'),
    userId: objectIdRef('User'),
    conversationId: { type: String, required: true, trim: true },
    messageId: { type: String, required: true, trim: true },
    provider: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    promptVersion: { type: String, required: true, trim: true },
    languageHint: { type: String, enum: ['ar', 'en', 'mixed'], required: true },
    latencyMs: { type: Number, required: true, min: 0 },
    usage: {
      inputTokens: { type: Number, min: 0 },
      outputTokens: { type: Number, min: 0 },
    },
    plan: { type: [Schema.Types.Mixed], required: true, default: [] },
    toolResults: { type: [Schema.Types.Mixed], required: true, default: [] },
    error: {
      code: { type: String, trim: true },
      message: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
    collection: 'assistant_llm_calls',
  },
);

assistantLlmCallSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
assistantLlmCallSchema.index({ tenantId: 1, createdAt: -1 });
assistantLlmCallSchema.index({ tenantId: 1, conversationId: 1, createdAt: -1 });

export type AssistantLlmCallPersistence = InferSchemaType<typeof assistantLlmCallSchema>;

export const AssistantLlmCallModel: Model<AssistantLlmCallPersistence> =
  (models.AssistantLlmCall as Model<AssistantLlmCallPersistence> | undefined) ??
  model<AssistantLlmCallPersistence>('AssistantLlmCall', assistantLlmCallSchema);
