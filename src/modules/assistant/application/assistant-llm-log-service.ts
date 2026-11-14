import { randomUUID } from 'node:crypto';

import {
  type AssistantLlmCallRecord,
  type AssistantLlmCallRepository,
} from './assistant-repositories';

export type AssistantLlmLogEntry = Omit<AssistantLlmCallRecord, 'callId' | 'createdAt'>;

export class AssistantLlmLogService {
  public constructor(
    private readonly repository: Pick<AssistantLlmCallRepository, 'create'> &
      Partial<Pick<AssistantLlmCallRepository, 'list'>>,
  ) {}

  public async record(entry: AssistantLlmLogEntry): Promise<void> {
    await this.repository.create({
      ...entry,
      callId: randomUUID(),
      plan: entry.plan.map((item) => ({
        tool: item.tool,
        arguments: redactValue(item.arguments) as Record<string, unknown>,
      })),
      toolResults: entry.toolResults.map((result) => ({
        ...result,
        summary: redactText(result.summary),
      })),
      ...(entry.error
        ? {
            error: {
              code: entry.error.code,
              message: redactText(entry.error.message),
            },
          }
        : {}),
      createdAt: new Date(),
    });
  }

  public list(params: Parameters<AssistantLlmCallRepository['list']>[0]) {
    if (!this.repository.list) {
      return Promise.resolve({ items: [], total: 0 });
    }
    return this.repository.list(params);
  }
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && /^(phone|mobile|email|nationalId|national_id)$/i.test(key)) {
    if (/email/i.test(key)) {
      return '[REDACTED_EMAIL]';
    }
    if (/national/i.test(key)) {
      return '[REDACTED_ID]';
    }
    return '[REDACTED_PHONE]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactValue(childValue, childKey),
      ]),
    );
  }

  return typeof value === 'string' ? redactText(value) : value;
}

function redactText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)/g, '[REDACTED_PHONE]');
}
