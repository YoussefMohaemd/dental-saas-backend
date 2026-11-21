import { afterEach, describe, expect, it, vi } from 'vitest';

import { CloudflareAssistantLlmProvider } from './cloudflare-llm-provider';

describe('CloudflareAssistantLlmProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends function tools and maps tool calls to assistant actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            response:
              '{"reply":"Assistant planned tool execution.","actions":[]}',
            tool_calls: [
              {
                function: {
                  name: 'search_patients',
                  arguments: '{"search":"يوسف"}',
                },
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new CloudflareAssistantLlmProvider({
      accountId: 'account-1',
      apiToken: 'token-1',
      model: '@cf/zai-org/glm-4.7-flash',
      timeoutMs: 1_000,
    });

    const result = await provider.completePlan({
      userMessage: 'ابحث عن يوسف',
      systemPrompt: 'You are assistant.',
      tools: [
        {
          name: 'search_patients',
          description: 'Search patients',
          argumentsHint: '{"search"?: string}',
          parameters: {
            type: 'object',
            properties: {
              search: { type: 'string' },
            },
            additionalProperties: false,
          },
          operationType: 'read',
          requiredCapabilities: [],
          capabilityMatchMode: 'all',
          requiresConfirmation: false,
          timeoutMs: 20_000,
          auditMetadata: { domain: 'patients', action: 'search' },
        },
      ],
      languageHint: 'ar',
    });

    expect(result).toEqual({
      reply: 'Assistant planned tool execution.',
      actions: [
        {
          id: 'tool-1',
          tool: 'search_patients',
          arguments: { search: 'يوسف' },
          dependsOn: [],
        },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-1/ai/v1/chat/completions',
    );
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
    });
  });
});

