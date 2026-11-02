import { z } from 'zod';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../../shared/application/errors/application-error';
import {
  type AssistantLlmCompletionRequest,
  type AssistantLlmCompletionResult,
  type AssistantLlmProvider,
} from '../../application/llm-provider';

const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(
            z.object({
              text: z.string().optional(),
            }),
          ),
        }),
      }),
    )
    .min(1),
});

const jsonCompletionSchema = z.object({
  reply: z.string().min(1),
  actions: z
    .array(
      z.object({
        id: z.string().min(1),
        tool: z.string().min(1),
        arguments: z.record(z.string(), z.unknown()).default({}),
        dependsOn: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

interface GeminiProviderOptions {
  model: string;
  timeoutMs: number;
  apiKey?: string;
  baseUrl?: string;
}

export class GeminiAssistantLlmProvider implements AssistantLlmProvider {
  public readonly name = 'gemini' as const;

  public constructor(private readonly options: GeminiProviderOptions) {}

  public async completePlan(
    request: AssistantLlmCompletionRequest,
  ): Promise<AssistantLlmCompletionResult> {
    const apiKey = this.options.apiKey;
    if (!apiKey) {
      throw new ApplicationError({
        message: 'Gemini provider is missing API key',
        statusCode: 500,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      });
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);
    const baseUrl = this.options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const model = encodeURIComponent(this.options.model);
    const url = `${trimTrailingSlash(baseUrl)}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: request.systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: request.userMessage }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
        signal: request.signal ?? abortController.signal,
      });

      if (!response.ok) {
        throw new ApplicationError({
          message: 'Gemini completion request failed',
          statusCode: 502,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          details: {
            status: response.status,
            statusText: response.statusText,
          },
        });
      }

      const raw = await response.json();
      const parsed = geminiResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ApplicationError({
          message: 'Invalid Gemini response shape',
          statusCode: 502,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          details: {
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        });
      }

      const responseText =
        parsed.data.candidates[0]?.content.parts
          .map((part) => part.text ?? '')
          .join('\n')
          .trim() ?? '';

      if (!responseText) {
        throw new ApplicationError({
          message: 'Gemini did not return assistant content',
          statusCode: 502,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
        });
      }

      const completionPayload = parseJsonObject(responseText);
      const completion = jsonCompletionSchema.safeParse(completionPayload);
      if (!completion.success) {
        throw new ApplicationError({
          message: 'Invalid structured assistant completion payload',
          statusCode: 502,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          details: {
            issues: completion.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        });
      }

      return {
        reply: completion.data.reply,
        actions: completion.data.actions,
      };
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApplicationError({
          message: 'Assistant model request timed out',
          statusCode: 504,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: true,
        });
      }

      throw new ApplicationError({
        message: 'Assistant model request failed',
        statusCode: 502,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected object');
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new ApplicationError({
      message: 'Assistant model output is not valid JSON object',
      statusCode: 502,
      code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      expose: true,
    });
  }
}

