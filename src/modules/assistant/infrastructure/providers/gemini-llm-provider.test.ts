import { describe, expect, it, vi } from 'vitest';

import { isRateLimitError, isStructuredOutputError } from '../../application/assistant-service';
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

  it('passes tool schemas and argument hints to Gemini declarations', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'ok',
      functionCalls: [],
    });
    const provider = new GeminiAssistantLlmProvider({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1_000,
      client: { models: { generateContent } },
    });
    const tool = {
      name: 'update_patient',
      description: 'Update a patient',
      argumentsHint: '{"patientId"?: string, "patientName"?: string}',
      parameters: {
        type: 'object' as const,
        properties: {
          patientId: { type: 'string' },
          patientName: { type: 'string' },
        },
        additionalProperties: false,
      },
      operationType: 'write' as const,
      requiredCapabilities: [],
      capabilityMatchMode: 'all' as const,
      requiresConfirmation: true,
      timeoutMs: 20_000,
      auditMetadata: { domain: 'patients', action: 'update' },
    };

    await provider.completePlan({
      userMessage: 'update Omar',
      systemPrompt: 'Use tools when needed.',
      tools: [tool],
      languageHint: 'en',
    });

    const request = generateContent.mock.calls[0]?.[0] as {
      config?: {
        tools?: Array<{
          functionDeclarations?: Array<{
            description?: string;
            parametersJsonSchema?: unknown;
          }>;
        }>;
      };
    };
    const declaration = request.config?.tools?.[0]?.functionDeclarations?.[0];
    expect(declaration?.description).toContain(tool.argumentsHint);
    expect(declaration?.parametersJsonSchema).toEqual(tool.parameters);
  });

  it('parses a planner JSON object from Gemini text when no function calls are returned', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        reply: 'I found the company information.',
        actions: [
          {
            id: 'act_get_company_info',
            tool: 'get_company_info',
            arguments: {},
            dependsOn: [],
          },
        ],
      }),
      functionCalls: [],
    });
    const provider = new GeminiAssistantLlmProvider({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1_000,
      client: { models: { generateContent } },
    });

    await expect(
      provider.completePlan({
        userMessage: 'Tell me about the company',
        systemPrompt: 'Use function calling.',
        tools: [],
        languageHint: 'en',
      }),
    ).resolves.toEqual({
      reply: 'I found the company information.',
      actions: [
        {
          id: 'act_get_company_info',
          tool: 'get_company_info',
          arguments: {},
          dependsOn: [],
        },
      ],
    });
  });

  it('returns plain Gemini text as a reply when no function calls are returned', async () => {
    const provider = new GeminiAssistantLlmProvider({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1_000,
      client: {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: 'Hello, how can I help?',
            functionCalls: [],
          }),
        },
      },
    });

    await expect(
      provider.completePlan({
        userMessage: 'hello',
        systemPrompt: 'Answer normally when no tool is needed.',
        tools: [],
        languageHint: 'en',
      }),
    ).resolves.toEqual({
      reply: 'Hello, how can I help?',
      actions: [],
    });
  });

  it('rejects malformed Gemini planner JSON as a structured-output error', async () => {
    const provider = new GeminiAssistantLlmProvider({
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 1_000,
      client: {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: '{"reply":"ok","actions":[{"tool":"get_company_info","arguments":"wrong"}]}',
            functionCalls: [],
          }),
        },
      },
    });

    const error = await provider
      .completePlan({
        userMessage: 'Tell me about the company',
        systemPrompt: 'Use function calling.',
        tools: [],
        languageHint: 'en',
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(isStructuredOutputError(error)).toBe(true);
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
