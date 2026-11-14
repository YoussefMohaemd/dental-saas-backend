import { Types } from 'mongoose';

import {
  type AssistantLlmCallRecord,
  type AssistantLlmCallRepository,
} from '../../../application/assistant-repositories';
import { AssistantLlmCallModel } from './assistant-llm-call.model';

export class MongooseAssistantLlmCallRepository implements AssistantLlmCallRepository {
  public async create(record: AssistantLlmCallRecord): Promise<void> {
    await AssistantLlmCallModel.create({
      callId: record.callId,
      tenantId: new Types.ObjectId(record.tenantId),
      userId: new Types.ObjectId(record.userId),
      conversationId: record.conversationId,
      messageId: record.messageId,
      provider: record.provider,
      model: record.model,
      promptVersion: record.promptVersion,
      languageHint: record.languageHint,
      latencyMs: record.latencyMs,
      usage: record.usage,
      plan: record.plan,
      toolResults: record.toolResults,
      error: record.error,
      createdAt: record.createdAt,
      updatedAt: record.createdAt,
    });
  }

  public async list(params: {
    tenantId: string;
    conversationId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    status?: 'success' | 'failed';
    page: number;
    pageSize: number;
  }): Promise<{ items: AssistantLlmCallRecord[]; total: number }> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(params.tenantId),
    };
    if (params.conversationId) filter.conversationId = params.conversationId;
    if (params.userId) filter.userId = new Types.ObjectId(params.userId);
    if (params.from || params.to) {
      filter.createdAt = {
        ...(params.from ? { $gte: params.from } : {}),
        ...(params.to ? { $lte: params.to } : {}),
      };
    }
    if (params.status === 'failed') filter.error = { $exists: true };
    if (params.status === 'success') filter.error = { $exists: false };

    const [rows, total] = await Promise.all([
      AssistantLlmCallModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((params.page - 1) * params.pageSize)
        .limit(params.pageSize)
        .lean(),
      AssistantLlmCallModel.countDocuments(filter),
    ]);

    return {
      items: rows.map((row) => ({
        callId: row.callId,
        tenantId: String(row.tenantId),
        userId: String(row.userId),
        conversationId: row.conversationId,
        messageId: row.messageId,
        provider: row.provider,
        model: row.model,
        promptVersion: row.promptVersion,
        languageHint: row.languageHint,
        latencyMs: row.latencyMs,
        ...(typeof row.usage?.inputTokens === 'number' &&
        typeof row.usage.outputTokens === 'number'
          ? {
              usage: {
                inputTokens: row.usage.inputTokens,
                outputTokens: row.usage.outputTokens,
              },
            }
          : {}),
        plan: row.plan as AssistantLlmCallRecord['plan'],
        toolResults: row.toolResults as AssistantLlmCallRecord['toolResults'],
        ...(row.error?.code && row.error.message
          ? { error: { code: row.error.code, message: row.error.message } }
          : {}),
        createdAt: row.createdAt,
      })),
      total,
    };
  }
}
