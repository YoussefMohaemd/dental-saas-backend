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

const openAiResponseSchema = z.object({
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
                  arguments: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
                }),
              }),
            )
            .optional(),
        }),
      }),
    )
    .min(1),
});

const cloudflareResultSchema = z.object({
  result: z.object({
    response: z.string().optional(),
    tool_calls: z
      .array(
        z.object({
          function: z.object({
            name: z.string(),
            arguments: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
          }),
        }),
      )
      .optional(),
  }),
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

interface CloudflareProviderOptions {
  accountId: string;
  apiToken: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens?: number;
}

export class CloudflareAssistantLlmProvider implements AssistantLlmProvider {
  public readonly name = 'cloudflare' as const;
  public readonly model: string;

  public constructor(private readonly options: CloudflareProviderOptions) {
    this.model = options.model;
  }

  public async completePlan(
    request: AssistantLlmCompletionRequest,
  ): Promise<AssistantLlmCompletionResult> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      const hasTools = request.tools.length > 0;
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.options.accountId}/ai/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.options.apiToken}`,
            'Content-Type': 'application/json',
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
            ...(this.options.maxOutputTokens !== undefined
              ? { max_tokens: this.options.maxOutputTokens }
              : {}),
            ...(hasTools
              ? {
                  tools: request.tools.map((tool) => ({
                    type: 'function',
                    function: {
                      name: tool.name,
                      description: tool.description,
                      parameters: tool.parameters ?? { type: 'object', additionalProperties: true },
                    },
                  })),
                  tool_choice: 'auto',
                  parallel_tool_calls: true,
                }
              : {}),
          }),
          signal: request.signal ?? abortController.signal,
        },
      );

      if (!response.ok) {
        const message = await response.text();
        throw new ApplicationError({
          message: 'Cloudflare completion request failed',
          statusCode: response.status === 429 ? 429 : 502,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: response.status === 429,
          details: {
            status: response.status,
            statusText: response.statusText,
            upstreamError: message.slice(0, 1_000),
          },
        });
      }

      const payload = (await response.json()) as unknown;
      return parseCompletion(payload);
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
        details: {
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseCompletion(raw: unknown): AssistantLlmCompletionResult {
  const openAi = openAiResponseSchema.safeParse(raw);
  if (openAi.success) {
    return parseMessage(
      openAi.data.choices[0]?.message?.content,
      openAi.data.choices[0]?.message?.tool_calls,
    );
  }

  const cloudflare = cloudflareResultSchema.safeParse(raw);
  if (cloudflare.success) {
    return parseMessage(cloudflare.data.result.response, cloudflare.data.result.tool_calls);
  }

  throw new ApplicationError({
    message: 'Invalid Cloudflare response shape',
    statusCode: 502,
    code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
    expose: true,
  });
}

function parseMessage(
  content: string | null | undefined,
  toolCalls:
    | Array<{
        function: { name: string; arguments?: string | Record<string, unknown> | undefined };
      }>
    | undefined,
): AssistantLlmCompletionResult {
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

  if (!content || content.trim().length === 0) {
    throw new ApplicationError({
      message: 'Cloudflare did not return assistant content',
      statusCode: 502,
      code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      expose: true,
    });
  }

  const completionPayload = parseJsonObject(content);
  const completion = jsonCompletionSchema.safeParse(completionPayload);
  if (!completion.success) {
    throw new ApplicationError({
      message: 'Invalid structured assistant completion payload',
      statusCode: 502,
      code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      expose: true,
    });
  }

  return {
    reply: completion.data.reply,
    actions: completion.data.actions,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  const source = typeof value === 'string' ? value : '{}';
  try {
    const parsed = JSON.parse(source) as unknown;
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

