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
import { type AssistantPlanAction } from '../../domain/assistant.types';
import { buildSystemPromptWithTools } from './groq-llm-provider';

const vllmResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.union([z.string(), z.null()]).optional(),
          tool_calls: z
            .array(
              z.object({
                function: z.object({
                  name: z.string(),
                  arguments: z.string().optional().default('{}'),
                }),
              }),
            )
            .optional(),
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

interface VllmProviderOptions {
  model: string;
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
}

export class VllmAssistantLlmProvider implements AssistantLlmProvider {
  public readonly name = 'vllm' as const;

  public constructor(private readonly options: VllmProviderOptions) {}

  public async completePlan(
    request: AssistantLlmCompletionRequest,
  ): Promise<AssistantLlmCompletionResult> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(`${stripTrailingSlash(this.options.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            {
              role: 'system',
              content: buildSystemPromptWithTools(request.systemPrompt, request.tools),
            },
            ...(request.history ?? []),
            { role: 'user', content: request.userMessage },
          ],
          temperature: 0,
          response_format: {
            type: 'json_object',
          },
          tools: request.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters ?? { type: 'object', additionalProperties: true },
            },
          })),
        }),
        signal: request.signal ?? abortController.signal,
      });

      if (!response.ok) {
        throw new ApplicationError({
          message: 'vLLM completion request failed',
          statusCode: 502,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          details: {
            status: response.status,
            statusText: response.statusText,
          },
        });
      }

      const raw = await response.json();
      const parsed = vllmResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ApplicationError({
          message: 'Invalid vLLM response shape',
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

      const message = parsed.data.choices[0]?.message;
      const toolCalls = message?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        const actions: AssistantPlanAction[] = toolCalls.map((call, index) => ({
          id: `tool-${index + 1}`,
          tool: call.function.name,
          arguments: parseJsonObject(call.function.arguments),
          dependsOn: [],
        }));

        return {
          reply: 'Assistant planned tool execution.',
          actions,
        };
      }

      const content = message?.content;
      if (!content) {
        throw new ApplicationError({
          message: 'vLLM did not return assistant content',
          statusCode: 502,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
        });
      }

      const completionPayload = parseJsonObject(content);
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

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
