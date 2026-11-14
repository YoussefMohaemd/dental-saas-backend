import {
  GoogleGenAI,
  type FunctionDeclaration,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../../shared/application/errors/application-error';
import {
  type AssistantLlmCompletionRequest,
  type AssistantLlmCompletionResult,
  type AssistantLlmProvider,
} from '../../application/llm-provider';

interface GeminiClient {
  models: {
    generateContent: (
      parameters: GenerateContentParameters,
    ) => Promise<GenerateContentResponse>;
  };
}

interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  client?: GeminiClient;
}

export class GeminiAssistantLlmProvider implements AssistantLlmProvider {
  public readonly name = 'gemini' as const;
  public readonly model: string;

  private readonly client: GeminiClient;

  public constructor(private readonly options: GeminiProviderOptions) {
    this.model = options.model;
    this.client =
      options.client ??
      new GoogleGenAI({
        apiKey: options.apiKey,
      });
  }

  public async completePlan(
    request: AssistantLlmCompletionRequest,
  ): Promise<AssistantLlmCompletionResult> {
    if (!this.options.apiKey) {
      throw new ApplicationError({
        message: 'Gemini provider is missing API key',
        statusCode: 500,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      });
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      const response = await this.client.models.generateContent({
        model: this.options.model,
        contents: [
          ...(request.history ?? []).map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
          {
            role: 'user',
            parts: [{ text: request.userMessage }],
          },
        ],
        config: {
          systemInstruction: request.systemPrompt,
          temperature: 0,
          abortSignal: request.signal ?? abortController.signal,
          ...(request.tools.length > 0
            ? {
                tools: [
                  {
                    functionDeclarations: request.tools.map(toGeminiFunctionDeclaration),
                  },
                ],
              }
            : {}),
        },
      });

      return parseGeminiResponse(response);
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new ApplicationError({
          message: 'Assistant model request timed out',
          statusCode: 504,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: true,
        });
      }

      const upstreamStatus = getUpstreamStatus(error);
      if (upstreamStatus === 429) {
        throw new ApplicationError({
          message: 'Gemini provider rate limit exceeded',
          statusCode: 429,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: true,
          details: { status: 429 },
        });
      }

      throw new ApplicationError({
        message: 'Gemini completion request failed',
        statusCode: 502,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
        details: {
          ...(upstreamStatus !== undefined ? { status: upstreamStatus } : {}),
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toGeminiFunctionDeclaration(
  tool: AssistantLlmCompletionRequest['tools'][number],
): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters ?? {
      type: 'object',
      additionalProperties: true,
    },
  };
}

function parseGeminiResponse(response: GenerateContentResponse): AssistantLlmCompletionResult {
  const functionCalls = response.functionCalls ?? [];
  const reply = response.text?.trim() ?? '';

  if (!reply && functionCalls.length === 0) {
    throw new ApplicationError({
      message: 'Gemini did not return assistant content',
      statusCode: 502,
      code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      expose: true,
    });
  }

  return {
    reply: reply || 'Assistant planned tool execution.',
    actions: functionCalls.map((call, index) => {
      if (!call.name) {
        throw new ApplicationError({
          message: 'Gemini returned a function call without a name',
          statusCode: 502,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: true,
        });
      }

      return {
        id: `a${index + 1}`,
        tool: call.name,
        arguments: call.args ?? {},
        dependsOn: [],
      };
    }),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getUpstreamStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const status = (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : undefined;
}
