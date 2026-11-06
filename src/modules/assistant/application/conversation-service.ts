import { randomUUID } from 'node:crypto';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import {
  type AssistantConversationMessageRecord,
  type AssistantConversationRecord,
  type AssistantConversationRepository,
} from './assistant-repositories';
import { type AssistantPromptResultType } from './prompt-catalog-service';

export class ConversationService {
  public constructor(private readonly conversationRepository: AssistantConversationRepository) {}

  public async createConversation(params: {
    tenantId: string;
    userId: string;
    title?: string;
  }): Promise<AssistantConversationRecord> {
    const welcomeMessage = this.buildMessage({
      role: 'assistant',
      text: 'How can I help you today?',
      resultType: 'text',
    });

    return this.conversationRepository.create({
      conversationId: randomUUID(),
      tenantId: params.tenantId,
      userId: params.userId,
      title: (params.title ?? 'New conversation').trim() || 'New conversation',
      initialMessage: welcomeMessage,
    });
  }

  public async getOwnedConversation(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
  }): Promise<AssistantConversationRecord> {
    const conversation = await this.conversationRepository.findOwnedConversation(params);
    if (conversation) {
      return conversation;
    }

    throw new ApplicationError({
      message: 'Conversation was not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  public listOwnedConversations(params: {
    tenantId: string;
    userId: string;
    limit: number;
  }): Promise<AssistantConversationRecord[]> {
    return this.conversationRepository.listOwnedConversations(params);
  }

  public async appendMessage(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    role: 'user' | 'assistant';
    text: string;
    resultType: AssistantPromptResultType;
    metadata?: Record<string, unknown>;
  }): Promise<AssistantConversationMessageRecord> {
    const message = this.buildMessage({
      role: params.role,
      text: params.text,
      resultType: params.resultType,
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });

    await this.conversationRepository.appendMessage({
      conversationId: params.conversationId,
      tenantId: params.tenantId,
      userId: params.userId,
      message,
    });

    return message;
  }

  public async markConversationStatus(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    status: 'active' | 'pending_confirmation';
  }): Promise<void> {
    await this.conversationRepository.updateStatus(params);
  }

  private buildMessage(params: {
    role: 'user' | 'assistant';
    text: string;
    resultType: AssistantPromptResultType;
    metadata?: Record<string, unknown>;
  }): AssistantConversationMessageRecord {
    return {
      id: randomUUID(),
      role: params.role,
      text: params.text,
      resultType: params.resultType,
      createdAt: new Date(),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    };
  }
}
