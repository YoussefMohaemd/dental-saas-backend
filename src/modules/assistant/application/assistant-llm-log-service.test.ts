import { describe, expect, it } from 'vitest';

import { AssistantLlmLogService } from './assistant-llm-log-service';

describe('AssistantLlmLogService', () => {
  it('records a redacted provider plan and tool-result summary', async () => {
    const records: Array<Record<string, unknown>> = [];
    const service = new AssistantLlmLogService({
      create: async (record) => {
        records.push(record as unknown as Record<string, unknown>);
      },
    });

    await service.record({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      provider: 'gemini',
      model: 'gemini-test',
      promptVersion: 'v1',
      languageHint: 'mixed',
      latencyMs: 120,
      plan: [
        {
          tool: 'search_patients',
          arguments: {
            phone: '+201012345678',
            email: 'patient@example.com',
            nationalId: '29801011234567',
          },
        },
      ],
      toolResults: [
        {
          tool: 'search_patients',
          status: 'success',
          summary: 'Found patient with phone +201012345678',
        },
      ],
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      tenantId: '66f100000000000000000001',
      provider: 'gemini',
      model: 'gemini-test',
      plan: [
        {
          tool: 'search_patients',
          arguments: {
            phone: '[REDACTED_PHONE]',
            email: '[REDACTED_EMAIL]',
            nationalId: '[REDACTED_ID]',
          },
        },
      ],
      toolResults: [
        {
          summary: 'Found patient with phone [REDACTED_PHONE]',
        },
      ],
    });
  });

  it('records provider errors without storing a raw prompt', async () => {
    const records: Array<Record<string, unknown>> = [];
    const service = new AssistantLlmLogService({
      create: async (record) => {
        records.push(record as unknown as Record<string, unknown>);
      },
    });

    await service.record({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      provider: 'gemini',
      model: 'gemini-test',
      promptVersion: 'v1',
      languageHint: 'ar',
      latencyMs: 42,
      plan: [],
      toolResults: [],
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });

    expect(records[0]).toMatchObject({
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
    expect(records[0]).not.toHaveProperty('prompt');
  });
});
