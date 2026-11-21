import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../../shared/application/errors/application-error';
import {
  type SpeechToTextProvider,
  type SttRequest,
  type SttResult,
} from '../../application/speech-to-text-provider';

interface GeminiSttClient {
  models: {
    generateContent: (parameters: {
      model: string;
      contents: Array<{
        role: 'user';
        parts: Array<
          | { text: string }
          | {
              inlineData: {
                mimeType: string;
                data: string;
              };
            }
        >;
      }>;
      config: { temperature: number; abortSignal: AbortSignal };
    }) => Promise<GenerateContentResponse>;
  };
}

interface GeminiSttProviderOptions {
  apiKey?: string;
  model: string;
  timeoutMs?: number;
  client?: GeminiSttClient;
}

export class GeminiSttProvider implements SpeechToTextProvider {
  public readonly name = 'gemini' as const;
  private readonly client: GeminiSttClient;

  public constructor(private readonly options: GeminiSttProviderOptions) {
    this.client =
      options.client ??
      new GoogleGenAI({
        ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      });
  }

  public async transcribe(input: SttRequest): Promise<SttResult> {
    if (!this.options.apiKey) {
      throw new ApplicationError({
        message: 'Gemini STT provider is missing API key',
        statusCode: 500,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      });
    }

    const timeoutSignal = AbortSignal.timeout(this.options.timeoutMs ?? 20_000);

    try {
      const response = await this.client.models.generateContent({
        model: this.options.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: buildTranscriptionPrompt(input.language),
              },
              {
                inlineData: {
                  mimeType: input.mimeType,
                  data: input.audio.toString('base64'),
                },
              },
            ],
          },
        ],
        config: {
          temperature: 0,
          abortSignal: input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal,
        },
      });

      const text = response.text?.trim() ?? '';
      return parseGeminiTranscription(text);
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new ApplicationError({
          message: 'Gemini transcription request timed out',
          statusCode: 504,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: true,
        });
      }
      const upstreamStatus = readUpstreamStatus(error);
      throw new ApplicationError({
        message: 'Gemini transcription request failed',
        // Preserve 429/503 so the service can retry or fall back; anything else is a bad gateway.
        statusCode: upstreamStatus === 429 || upstreamStatus === 503 ? upstreamStatus : 502,
        code:
          upstreamStatus === 429
            ? APPLICATION_ERROR_CODES.RATE_LIMITED
            : APPLICATION_ERROR_CODES.INTERNAL_ERROR,
        details: {
          upstream: 'gemini',
          ...(upstreamStatus ? { upstreamStatus } : {}),
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

function buildTranscriptionPrompt(languageHint: SttRequest['language']): string {
  const hintInstruction =
    languageHint && languageHint !== 'auto' ? ` Primary language hint is "${languageHint}".` : '';
  return `Transcribe this audio exactly. Keep Arabic and English words as spoken without translation.${hintInstruction} Return strict JSON only in this shape: {"text":"<transcript>","language":"<detected language>"}.`;
}

function parseGeminiTranscription(text: string): SttResult {
  const candidate = extractJsonObject(text);
  if (!candidate) {
    return { text };
  }

  try {
    const parsed = JSON.parse(candidate) as { text?: unknown; language?: unknown };
    if (typeof parsed.text !== 'string') {
      return { text };
    }

    return {
      text: parsed.text,
      ...(typeof parsed.language === 'string' ? { language: parsed.language } : {}),
    };
  } catch {
    return { text };
  }
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function readUpstreamStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      return status;
    }
  }
  const match = error instanceof Error ? error.message.match(/"code"\s*:\s*(\d{3})/) : null;
  return match?.[1] ? Number(match[1]) : undefined;
}
