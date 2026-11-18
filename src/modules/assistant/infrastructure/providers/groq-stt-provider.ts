import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../../shared/application/errors/application-error';
import { parseTranscriptionPayload } from '../../application/transcription-service';
import { type SpeechToTextProvider } from '../../application/speech-to-text-provider';

interface GroqSttProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
}

const MIME_EXTENSION: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

export class GroqSttProvider implements SpeechToTextProvider {
  public readonly name = 'groq' as const;

  public constructor(private readonly options: GroqSttProviderOptions) {}

  public async transcribe(input: {
    audio: Buffer;
    mimeType: string;
    languageHint?: string;
    signal?: AbortSignal;
  }): Promise<{ text: string }> {
    if (!this.options.apiKey) {
      throw new ApplicationError({
        message: 'Groq STT provider is missing API key',
        statusCode: 500,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      });
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs ?? 20_000);
    const signal = input.signal ?? abortController.signal;
    const baseUrl = stripTrailingSlash(this.options.baseUrl ?? 'https://api.groq.com/openai/v1');
    const extension = MIME_EXTENSION[input.mimeType] ?? 'webm';
    const form = new FormData();
    form.append('model', this.options.model);
    form.append('temperature', '0');
    form.append(
      'prompt',
      'Egyptian Arabic dental-clinic conversation with English terms: order, patient, doctor, clinic, crown, bridge.',
    );
    form.append(
      'file',
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType }),
      `audio.${extension}`,
    );

    try {
      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: form,
        signal,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new ApplicationError({
          message: `Groq transcription request failed (${response.status})`,
          statusCode: response.status,
          code:
            response.status === 429
              ? APPLICATION_ERROR_CODES.RATE_LIMITED
              : APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: response.status === 429,
          details: {
            upstream: 'groq',
            status: response.status,
            statusText: response.statusText,
            ...(message ? { message } : {}),
          },
        });
      }

      const payload = await response.json();
      return parseTranscriptionPayload(payload);
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApplicationError({
          message: 'Groq transcription request timed out',
          statusCode: 504,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: true,
        });
      }
      throw new ApplicationError({
        message: 'Groq transcription request failed',
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

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
