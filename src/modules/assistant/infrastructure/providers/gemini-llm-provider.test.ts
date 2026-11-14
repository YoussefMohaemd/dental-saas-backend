import { describe, expect, it, vi } from 'vitest';

import {
  isRateLimitError,
  isStructuredOutputError,
} from '../../application/assistant-service';
import { ApplicationError } from '../../../../shared/application/errors/application-error';
import { GeminiAssistantLlmProvider } from './gemini-llm-provider';

describe('GeminiAssistantLlmProvider', () => {
  it('maps Gemini text and function calls to an assistant plan', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'ok',
      functionCalls: [{ name: 'search_patients', args: { search: 'يوسف' } }],
    });
    const provider = new GeminiAssistantLlmProvider({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1_000,
      client: { models: { generateContent } },
    });

    await expect(
      provider.completePlan({
        userMessage: 'ابحث عن يوسف',
        systemPrompt: 'You are a dental assistant.',
        tools: [],
        languageHint: 'ar',
      }),
    ).resolves.toEqual({
      reply: 'ok',
      actions: [
        {
          id: 'a1',
          tool: 'search_patients',
          arguments: { search: 'يوسف' },
          dependsOn: [],
        },
      ],
    });

    expect(generateContent).toHaveBeenCalledOnce();
  });

  it('maps a Gemini rate-limit response to a recognizable application error', async () => {
    const provider = new GeminiAssistantLlmProvider({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1_000,
      client: {
        models: {
          generateContent: vi.fn().mockRejectedValue({ status: 429, message: 'Too many requests' }),
        },
      },
    });

    const error = await provider
      .completePlan({
        userMessage: 'hello',
        systemPrompt: 'system',
        tools: [],
        languageHint: 'en',
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(isRateLimitError(error)).toBe(true);
  });

  it('maps an empty Gemini candidate to the structured-output error convention', async () => {
    const provider = new GeminiAssistantLlmProvider({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1_000,
      client: {
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: '', functionCalls: [] }),
        },
      },
    });

    const error = await provider
      .completePlan({
        userMessage: 'hello',
        systemPrompt: 'system',
        tools: [],
        languageHint: 'en',
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(isStructuredOutputError(error)).toBe(true);
  });
});
