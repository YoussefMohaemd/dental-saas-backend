import { randomUUID } from 'node:crypto';

import { type AssistantAuditRepository } from './assistant-repositories';

export class AssistantAuditService {
  public constructor(private readonly assistantAuditRepository: AssistantAuditRepository) {}

  public async recordEvent(event: {
    tenantId: string;
    userId: string;
    conversationId?: string;
    messageId?: string;
    actionId?: string;
    eventType:
      | 'assistant.message.received'
      | 'assistant.message.responded'
      | 'assistant.confirmation.created'
      | 'assistant.confirmation.accepted'
      | 'assistant.permission.denied'
      | 'assistant.llm.called'
      | 'assistant.tool.executed';
    status: 'success' | 'denied' | 'failed';
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.assistantAuditRepository.create({
      eventId: randomUUID(),
      createdAt: new Date(),
      ...event,
    });
  }
}
