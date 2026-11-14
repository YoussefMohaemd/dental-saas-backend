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
      groqApiKey: undefined,
      groqBaseUrl: undefined,
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
        groqApiKey: undefined,
        groqBaseUrl: undefined,
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
      groqApiKey: undefined,
      groqBaseUrl: undefined,
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

  it('builds groq provider when configured', () => {
    const provider = createAssistantLlmProvider({
      provider: 'groq',
      model: 'qwen/qwen3-32b',
      timeoutMs: 15_000,
      vllmBaseUrl: 'http://localhost:8000/v1',
      vllmApiKey: undefined,
      groqApiKey: 'test-key',
      groqBaseUrl: undefined,
      plannerPromptVersion: 'v1',
    });

    expect(provider.name).toBe('groq');
  });

  it('throws when groq provider is configured without API key', () => {
    expect(() =>
      createAssistantLlmProvider({
        provider: 'groq',
        model: 'qwen/qwen3-32b',
        timeoutMs: 15_000,
        vllmBaseUrl: 'http://localhost:8000/v1',
        vllmApiKey: undefined,
        groqApiKey: undefined,
        groqBaseUrl: undefined,
        plannerPromptVersion: 'v1',
      }),
    ).toThrow('Groq provider requires AI_ASSISTANT_GROQ_API_KEY');
  });

  it('builds Gemini provider when configured', () => {
    const provider = createAssistantLlmProvider({
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      timeoutMs: 15_000,
      vllmBaseUrl: 'http://localhost:8000/v1',
      vllmApiKey: undefined,
      groqApiKey: undefined,
      groqBaseUrl: undefined,
      geminiApiKey: 'test-key',
      plannerPromptVersion: 'v1',
    });

    expect(provider.name).toBe('gemini');
  });

  it('throws when Gemini provider is configured without API key', () => {
    expect(() =>
      createAssistantLlmProvider({
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        timeoutMs: 15_000,
        vllmBaseUrl: 'http://localhost:8000/v1',
        vllmApiKey: undefined,
        groqApiKey: undefined,
        groqBaseUrl: undefined,
        geminiApiKey: undefined,
        plannerPromptVersion: 'v1',
      }),
    ).toThrow('Gemini provider requires AI_ASSISTANT_GEMINI_API_KEY');
  });

});
