import { type AssistantPromptResultType } from './prompt-catalog-service';

export interface AssistantConversationMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: Date;
  resultType: AssistantPromptResultType;
  metadata?: Record<string, unknown>;
}

export interface AssistantConversationRecord {
  conversationId: string;
  tenantId: string;
  userId: string;
  title: string;
  status: 'active' | 'pending_confirmation';
  messages: AssistantConversationMessageRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AssistantConversationRepository {
  create(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    title: string;
    initialMessage: AssistantConversationMessageRecord;
  }): Promise<AssistantConversationRecord>;
  findOwnedConversation(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
  }): Promise<AssistantConversationRecord | null>;
  listOwnedConversations(params: {
    tenantId: string;
    userId: string;
    limit: number;
  }): Promise<AssistantConversationRecord[]>;
  appendMessage(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    message: AssistantConversationMessageRecord;
  }): Promise<void>;
  updateStatus(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    status: 'active' | 'pending_confirmation';
  }): Promise<void>;
}

export interface AssistantPendingActionRecord {
  actionId: string;
  conversationId: string;
  tenantId: string;
  userId: string;
  toolName: string;
  payload: Record<string, unknown>;
  confirmationTokenHash: string;
  expiresAt: Date;
  consumedAt?: Date;
  status: 'pending' | 'processing' | 'confirmed' | 'expired' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface AssistantPendingActionRepository {
  create(action: AssistantPendingActionRecord): Promise<void>;
  findOwnedPendingAction(params: {
    actionId: string;
    tenantId: string;
    userId: string;
  }): Promise<AssistantPendingActionRecord | null>;
  markConfirmed(params: {
    actionId: string;
    tenantId: string;
    userId: string;
    consumedAt: Date;
  }): Promise<boolean>;
  markProcessing(params: {
    actionId: string;
    tenantId: string;
    userId: string;
    updatedAt: Date;
  }): Promise<boolean>;
  markPending(params: {
    actionId: string;
    tenantId: string;
    userId: string;
    updatedAt: Date;
  }): Promise<boolean>;
}

export interface AssistantAuditEventRecord {
  eventId: string;
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
  createdAt: Date;
}

export interface AssistantAuditRepository {
  create(event: AssistantAuditEventRecord): Promise<void>;
}

export interface AssistantLlmCallPlanItem {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface AssistantLlmCallToolResult {
  tool: string;
  status: string;
  summary: string;
}

export interface AssistantLlmCallRecord {
  callId: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  messageId: string;
  provider: string;
  model: string;
  promptVersion: string;
  languageHint: 'ar' | 'en' | 'mixed';
  latencyMs: number;
  usage?: { inputTokens: number; outputTokens: number };
  plan: AssistantLlmCallPlanItem[];
  toolResults: AssistantLlmCallToolResult[];
  error?: { code: string; message: string };
  createdAt: Date;
}

export interface AssistantLlmCallRepository {
  create(record: AssistantLlmCallRecord): Promise<void>;
  list(params: {
    tenantId: string;
    conversationId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    status?: 'success' | 'failed';
    page: number;
    pageSize: number;
  }): Promise<{ items: AssistantLlmCallRecord[]; total: number }>;
}
