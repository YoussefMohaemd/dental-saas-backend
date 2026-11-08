import { Types } from 'mongoose';

import {
  type AssistantConversationMessageRecord,
  type AssistantConversationRecord,
  type AssistantConversationRepository,
} from '../../../application/assistant-repositories';
import {
  AssistantConversationModel,
  type AssistantConversationPersistence,
} from './assistant-conversation.model';

export class MongooseAssistantConversationRepository implements AssistantConversationRepository {
  public async create(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    title: string;
    initialMessage: AssistantConversationRecord['messages'][number];
  }): Promise<AssistantConversationRecord> {
    const created = await AssistantConversationModel.create({
      conversationId: params.conversationId,
      tenantId: new Types.ObjectId(params.tenantId),
      userId: new Types.ObjectId(params.userId),
      title: params.title,
      status: 'active',
      messages: [params.initialMessage],
    });

    return toConversationRecord(created.toObject<AssistantConversationPersistence>());
  }

  public async findOwnedConversation(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
  }): Promise<AssistantConversationRecord | null> {
    const found = await AssistantConversationModel.findOne({
      conversationId: params.conversationId,
      tenantId: new Types.ObjectId(params.tenantId),
      userId: new Types.ObjectId(params.userId),
    })
      .lean<AssistantConversationPersistence | null>()
      .exec();

    if (!found) {
      return null;
    }

    return toConversationRecord(found);
  }

  public async listOwnedConversations(params: {
    tenantId: string;
    userId: string;
    limit: number;
  }): Promise<AssistantConversationRecord[]> {
    const rows = await AssistantConversationModel.find({
      tenantId: new Types.ObjectId(params.tenantId),
      userId: new Types.ObjectId(params.userId),
    })
      .select({
        conversationId: 1,
        tenantId: 1,
        userId: 1,
        title: 1,
        status: 1,
        messages: { $slice: -1 },
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ updatedAt: -1 })
      .limit(params.limit)
      .lean<AssistantConversationPersistence[]>()
      .exec();

    return rows.map((row) => toConversationRecord(row));
  }

  public async appendMessage(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    message: AssistantConversationRecord['messages'][number];
  }): Promise<void> {
    await AssistantConversationModel.updateOne(
      {
        conversationId: params.conversationId,
        tenantId: new Types.ObjectId(params.tenantId),
        userId: new Types.ObjectId(params.userId),
      },
      {
        $push: { messages: params.message },
      },
    ).exec();
  }

  public async updateStatus(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    status: 'active' | 'pending_confirmation';
  }): Promise<void> {
    await AssistantConversationModel.updateOne(
      {
        conversationId: params.conversationId,
        tenantId: new Types.ObjectId(params.tenantId),
        userId: new Types.ObjectId(params.userId),
      },
      {
        $set: { status: params.status },
      },
    ).exec();
  }
}

function toConversationRecord(
  raw: AssistantConversationPersistence & { createdAt: Date; updatedAt: Date },
): AssistantConversationRecord {
  return {
    conversationId: raw.conversationId,
    tenantId: raw.tenantId.toHexString(),
    userId: raw.userId.toHexString(),
    title: raw.title,
    status: raw.status,
    messages: raw.messages.map((message) => toConversationMessageRecord(message)),
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

function toConversationMessageRecord(rawMessage: unknown): AssistantConversationMessageRecord {
  const message = rawMessage as {
    id: unknown;
    role: unknown;
    text: unknown;
    createdAt: unknown;
    resultType: unknown;
    metadata?: unknown;
  };
  const metadata = normalizeMetadata(message.metadata);

  return {
    id: String(message.id),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    text: String(message.text),
    createdAt: new Date(String(message.createdAt)),
    resultType: normalizeResultType(String(message.resultType)),
    ...(metadata ? { metadata } : {}),
  };
}

function normalizeResultType(value: string): AssistantConversationMessageRecord['resultType'] {
  switch (value) {
    case 'text':
    case 'order-list':
    case 'order-details':
    case 'order-report':
    case 'patient-list':
    case 'patient-details':
    case 'chart':
    case 'table':
    case 'confirmation':
    case 'permission-denied':
    case 'error':
      return value;
    default:
      return 'text';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMetadata(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}
