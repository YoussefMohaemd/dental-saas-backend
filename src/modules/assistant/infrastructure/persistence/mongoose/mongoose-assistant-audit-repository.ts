import { Types } from 'mongoose';

import { type AssistantAuditEventRecord, type AssistantAuditRepository } from '../../../application/assistant-repositories';
import { AssistantAuditEventModel } from './assistant-audit-event.model';

export class MongooseAssistantAuditRepository implements AssistantAuditRepository {
  public async create(event: AssistantAuditEventRecord): Promise<void> {
    await AssistantAuditEventModel.create({
      eventId: event.eventId,
      tenantId: new Types.ObjectId(event.tenantId),
      userId: new Types.ObjectId(event.userId),
      conversationId: event.conversationId,
      messageId: event.messageId,
      actionId: event.actionId,
      eventType: event.eventType,
      status: event.status,
      details: event.details,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    });
  }
}
