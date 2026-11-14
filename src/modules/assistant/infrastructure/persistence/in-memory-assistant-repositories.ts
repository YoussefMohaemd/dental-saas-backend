import {
  type AssistantAuditEventRecord,
  type AssistantAuditRepository,
  type AssistantLlmCallRecord,
  type AssistantLlmCallRepository,
  type AssistantConversationRecord,
  type AssistantConversationRepository,
  type AssistantPendingActionRecord,
  type AssistantPendingActionRepository,
} from '../../application/assistant-repositories';

export class InMemoryAssistantConversationRepository implements AssistantConversationRepository {
  private readonly conversations = new Map<string, AssistantConversationRecord>();

  public create(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    title: string;
    initialMessage: AssistantConversationRecord['messages'][number];
  }): Promise<AssistantConversationRecord> {
    const now = new Date();
    const record: AssistantConversationRecord = {
      conversationId: params.conversationId,
      tenantId: params.tenantId,
      userId: params.userId,
      title: params.title,
      status: 'active',
      messages: [params.initialMessage],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(record.conversationId, record);
    return Promise.resolve(cloneConversation(record));
  }

  public findOwnedConversation(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
  }): Promise<AssistantConversationRecord | null> {
    const record = this.conversations.get(params.conversationId);
    if (!record) {
      return Promise.resolve(null);
    }

    if (record.tenantId !== params.tenantId || record.userId !== params.userId) {
      return Promise.resolve(null);
    }

    return Promise.resolve(cloneConversation(record));
  }

  public listOwnedConversations(params: {
    tenantId: string;
    userId: string;
    limit: number;
  }): Promise<AssistantConversationRecord[]> {
    const records = [...this.conversations.values()]
      .filter((record) => record.tenantId === params.tenantId && record.userId === params.userId)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, params.limit)
      .map((record) => cloneConversation(record));
    return Promise.resolve(records);
  }

  public appendMessage(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    message: AssistantConversationRecord['messages'][number];
  }): Promise<void> {
    const record = this.conversations.get(params.conversationId);
    if (!record) {
      return Promise.resolve();
    }

    if (record.tenantId !== params.tenantId || record.userId !== params.userId) {
      return Promise.resolve();
    }

    record.messages = [...record.messages, params.message];
    record.updatedAt = new Date();
    return Promise.resolve();
  }

  public updateStatus(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    status: 'active' | 'pending_confirmation';
  }): Promise<void> {
    const record = this.conversations.get(params.conversationId);
    if (!record) {
      return Promise.resolve();
    }

    if (record.tenantId !== params.tenantId || record.userId !== params.userId) {
      return Promise.resolve();
    }

    record.status = params.status;
    record.updatedAt = new Date();
    return Promise.resolve();
  }
}

export class InMemoryAssistantPendingActionRepository implements AssistantPendingActionRepository {
  private readonly actions = new Map<string, AssistantPendingActionRecord>();

  public create(action: AssistantPendingActionRecord): Promise<void> {
    this.actions.set(action.actionId, { ...action });
    return Promise.resolve();
  }

  public findOwnedPendingAction(params: {
    actionId: string;
    tenantId: string;
    userId: string;
  }): Promise<AssistantPendingActionRecord | null> {
    const action = this.actions.get(params.actionId);
    if (!action) {
      return Promise.resolve(null);
    }

    if (action.tenantId !== params.tenantId || action.userId !== params.userId) {
      return Promise.resolve(null);
    }

    return Promise.resolve({ ...action });
  }

  public markConfirmed(params: {
    actionId: string;
    tenantId: string;
    userId: string;
    consumedAt: Date;
  }): Promise<boolean> {
    const current = this.actions.get(params.actionId);
    if (!current) {
      return Promise.resolve(false);
    }

    if (current.tenantId !== params.tenantId || current.userId !== params.userId) {
      return Promise.resolve(false);
    }

    if (current.status !== 'processing') {
      return Promise.resolve(false);
    }

    current.status = 'confirmed';
    current.consumedAt = params.consumedAt;
    current.updatedAt = params.consumedAt;
    return Promise.resolve(true);
  }

  public markProcessing(params: {
    actionId: string;
    tenantId: string;
    userId: string;
    updatedAt: Date;
  }): Promise<boolean> {
    const current = this.actions.get(params.actionId);
    if (!current) {
      return Promise.resolve(false);
    }

    if (current.tenantId !== params.tenantId || current.userId !== params.userId) {
      return Promise.resolve(false);
    }

    if (current.status !== 'pending' && current.status !== 'failed') {
      return Promise.resolve(false);
    }

    current.status = 'processing';
    current.updatedAt = params.updatedAt;
    return Promise.resolve(true);
  }

  public markPending(params: {
    actionId: string;
    tenantId: string;
    userId: string;
    updatedAt: Date;
  }): Promise<boolean> {
    const current = this.actions.get(params.actionId);
    if (!current) {
      return Promise.resolve(false);
    }

    if (current.tenantId !== params.tenantId || current.userId !== params.userId) {
      return Promise.resolve(false);
    }

    if (current.status !== 'processing') {
      return Promise.resolve(false);
    }

    current.status = 'pending';
    current.updatedAt = params.updatedAt;
    return Promise.resolve(true);
  }
}

export class InMemoryAssistantAuditRepository implements AssistantAuditRepository {
  public readonly events: AssistantAuditEventRecord[] = [];

  public create(event: AssistantAuditEventRecord): Promise<void> {
    this.events.push({ ...event });
    return Promise.resolve();
  }
}

export class InMemoryAssistantLlmCallRepository implements AssistantLlmCallRepository {
  public readonly records: AssistantLlmCallRecord[] = [];

  public create(record: AssistantLlmCallRecord): Promise<void> {
    this.records.push({ ...record });
    return Promise.resolve();
  }

  public list(params: {
    tenantId: string;
    conversationId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    status?: 'success' | 'failed';
    page: number;
    pageSize: number;
  }): Promise<{ items: AssistantLlmCallRecord[]; total: number }> {
    const filtered = this.records.filter((record) => {
      if (record.tenantId !== params.tenantId) return false;
      if (params.conversationId && record.conversationId !== params.conversationId) return false;
      if (params.userId && record.userId !== params.userId) return false;
      if (params.from && record.createdAt < params.from) return false;
      if (params.to && record.createdAt > params.to) return false;
      if (params.status && (params.status === 'failed') !== Boolean(record.error)) return false;
      return true;
    });
    const start = (params.page - 1) * params.pageSize;
    return Promise.resolve({
      items: filtered.slice(start, start + params.pageSize).map((record) => ({ ...record })),
      total: filtered.length,
    });
  }
}

function cloneConversation(record: AssistantConversationRecord): AssistantConversationRecord {
  return {
    ...record,
    messages: [...record.messages],
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}
