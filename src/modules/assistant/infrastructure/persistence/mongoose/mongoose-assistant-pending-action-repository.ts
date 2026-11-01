import { Types } from 'mongoose';

import {
  type AssistantPendingActionRecord,
  type AssistantPendingActionRepository,
} from '../../../application/assistant-repositories';
import {
  AssistantPendingActionModel,
  type AssistantPendingActionPersistence,
} from './assistant-pending-action.model';

export class MongooseAssistantPendingActionRepository implements AssistantPendingActionRepository {
  public async create(action: AssistantPendingActionRecord): Promise<void> {
    await AssistantPendingActionModel.create({
      actionId: action.actionId,
      conversationId: action.conversationId,
      tenantId: new Types.ObjectId(action.tenantId),
      userId: new Types.ObjectId(action.userId),
      toolName: action.toolName,
      payload: action.payload,
      confirmationTokenHash: action.confirmationTokenHash,
      expiresAt: action.expiresAt,
      consumedAt: action.consumedAt,
      status: action.status,
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
    });
  }

  public async findOwnedPendingAction(params: {
    actionId: string;
    tenantId: string;
    userId: string;
  }): Promise<AssistantPendingActionRecord | null> {
    const found = await AssistantPendingActionModel.findOne({
      actionId: params.actionId,
      tenantId: new Types.ObjectId(params.tenantId),
      userId: new Types.ObjectId(params.userId),
    })
      .lean<AssistantPendingActionPersistence | null>()
      .exec();

    if (!found) {
      return null;
    }

    return {
      actionId: found.actionId,
      conversationId: found.conversationId,
      tenantId: found.tenantId.toHexString(),
      userId: found.userId.toHexString(),
      toolName: found.toolName,
      payload: toActionPayload(found.payload),
      confirmationTokenHash: found.confirmationTokenHash,
      expiresAt: new Date(found.expiresAt),
      ...(found.consumedAt ? { consumedAt: new Date(found.consumedAt) } : {}),
      status: found.status,
      createdAt: new Date(found.createdAt),
      updatedAt: new Date(found.updatedAt),
    };
  }

  public async markConfirmed(params: {
    actionId: string;
    tenantId: string;
    userId: string;
    consumedAt: Date;
  }): Promise<void> {
    await AssistantPendingActionModel.updateOne(
      {
        actionId: params.actionId,
        tenantId: new Types.ObjectId(params.tenantId),
        userId: new Types.ObjectId(params.userId),
        status: 'pending',
      },
      {
        $set: {
          status: 'confirmed',
          consumedAt: params.consumedAt,
        },
      },
    ).exec();
  }
}

function toActionPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
