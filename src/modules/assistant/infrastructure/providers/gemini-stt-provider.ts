import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../../shared/application/errors/application-error';
import { type SpeechToTextProvider } from '../../application/speech-to-text-provider';

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

  public async transcribe(input: {
    audio: Buffer;
    mimeType: string;
    languageHint?: string;
    signal?: AbortSignal;
  }): Promise<{ text: string }> {
    if (!this.options.apiKey) {
      throw new ApplicationError({
        message: 'Gemini STT provider is missing API key',
        statusCode: 500,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      });
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs ?? 20_000);

    try {
      const response = await this.client.models.generateContent({
        model: this.options.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Transcribe this audio exactly. Keep Arabic and English words as spoken without translation.',
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
          abortSignal: input.signal ?? abortController.signal,
        },
      });

      const text = response.text?.trim() ?? '';
      return { text };
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApplicationError({
          message: 'Gemini transcription request timed out',
          statusCode: 504,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: true,
        });
      }
      throw new ApplicationError({
        message: 'Gemini transcription request failed',
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
