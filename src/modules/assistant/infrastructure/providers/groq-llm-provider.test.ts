import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildAssistantToolRegistry } from '../../application/tool-registry';
import { GroqAssistantLlmProvider } from './groq-llm-provider';

describe('GroqAssistantLlmProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses JSON mode without native tools and describes tools in the system prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ reply: 'Here are the overdue orders.', actions: [] }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GroqAssistantLlmProvider({
      model: 'test-model',
      timeoutMs: 1_000,
      apiKey: 'test-key',
    });
    const tools = buildAssistantToolRegistry().list();

    const result = await provider.completePlan({
      userMessage: 'show overdue orders',
      systemPrompt: 'You are Dental SaaS assistant.',
      tools,
      languageHint: 'en',
    });

    expect(result).toEqual({
      reply: 'Here are the overdue orders.',
      actions: [],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');

    const body = JSON.parse(init.body as string) as {
      response_format?: unknown;
      tools?: unknown;
      max_completion_tokens?: number;
      messages: Array<{ role: string; content: string }>;
    };

    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_completion_tokens).toBeLessThanOrEqual(1000);
    expect(body).not.toHaveProperty('tools');
    expect(body.messages[0]?.content).toContain('search_orders');
    expect(body.messages[0]?.content).toContain('Search orders by filters and keywords');
    expect(body.messages[0]?.content).toContain('"status"?: string[]');
  });

  it('retries once without history when groq returns 400 and history is present', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: 'bad request with history' },
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ reply: 'Recovered', actions: [] }),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GroqAssistantLlmProvider({
      model: 'test-model',
      timeoutMs: 1_000,
      apiKey: 'test-key',
    });

    const result = await provider.completePlan({
      userMessage: 'hello',
      history: [{ role: 'assistant', content: 'previous context' }],
      systemPrompt: 'You are assistant',
      tools: [],
      languageHint: 'en',
    });

    expect(result.reply).toBe('Recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(firstBody.messages.some((message) => message.role === 'assistant')).toBe(true);
    expect(secondBody.messages.some((message) => message.role === 'assistant')).toBe(false);
  });
});
