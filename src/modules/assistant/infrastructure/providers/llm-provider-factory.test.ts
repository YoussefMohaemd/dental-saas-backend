import { describe, expect, it, vi } from 'vitest';

import { createAssistantLlmProvider } from './llm-provider-factory';

describe('createAssistantLlmProvider', () => {
  it('builds mock provider when configured', () => {
    const provider = createAssistantLlmProvider({
      provider: 'mock',
      model: 'Qwen/Qwen3.5-9B',
      timeoutMs: 15_000,
      vllmBaseUrl: 'http://localhost:8000/v1',
      vllmApiKey: undefined,
      plannerPromptVersion: 'v1',
    });

    expect(provider.name).toBe('mock');
  });

  it('throws for unsupported provider value', () => {
    expect(() =>
      createAssistantLlmProvider({
        provider: 'unknown' as never,
        model: 'Qwen/Qwen3.5-9B',
        timeoutMs: 15_000,
        vllmBaseUrl: 'http://localhost:8000/v1',
        vllmApiKey: undefined,
        plannerPromptVersion: 'v1',
      }),
    ).toThrow('Unsupported assistant LLM provider');
  });

  it('passes AbortSignal to provider calls', async () => {
    const provider = createAssistantLlmProvider({
      provider: 'mock',
      model: 'Qwen/Qwen3.5-9B',
      timeoutMs: 15_000,
      vllmBaseUrl: 'http://localhost:8000/v1',
      vllmApiKey: undefined,
      plannerPromptVersion: 'v1',
    });

    const abortController = new AbortController();
    const result = await provider.completePlan({
      userMessage: 'show overdue orders',
      systemPrompt: 'system',
      tools: [],
      languageHint: 'en',
      signal: abortController.signal,
    });

    expect(result.reply).toContain('show overdue orders');
    expect(result.actions).toEqual([]);
    expect(vi.isMockFunction((provider as unknown as { completePlan: unknown }).completePlan)).toBe(
      false,
    );
  });
});
