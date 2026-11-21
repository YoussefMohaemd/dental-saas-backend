import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../../shared/application/errors/application-error';
import { parseTranscriptionPayload } from '../../application/transcription-service';
import {
  type SpeechToTextProvider,
  type SttRequest,
  type SttResult,
  type SttSegment,
} from '../../application/speech-to-text-provider';

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

  public async transcribe(input: SttRequest): Promise<SttResult> {
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
    form.append('response_format', 'verbose_json');
    form.append(
      'prompt',
      'Egyptian Arabic dental-clinic conversation with English terms: order, patient, doctor, clinic, crown, bridge.',
    );
    if (input.language === 'ar' || input.language === 'en') {
      form.append('language', input.language);
    }
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
      const parsed = parseTranscriptionPayload(payload);
      const metadata = parseGroqMetadata(payload);
      return {
        ...parsed,
        ...metadata,
      };
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

function parseGroqMetadata(payload: unknown): Omit<SttResult, 'text'> {
  if (!isRecord(payload)) {
    return {};
  }

  const segments = Array.isArray(payload.segments)
    ? payload.segments.map(mapSegment).filter((segment): segment is SttSegment => segment !== null)
    : undefined;

  const confidence = segments && segments.length > 0 ? computeConfidence(segments) : undefined;
  return {
    ...(typeof payload.language === 'string' ? { language: payload.language } : {}),
    ...(segments && segments.length > 0 ? { segments } : {}),
    ...(typeof confidence === 'number' ? { confidence } : {}),
  };
}

function mapSegment(value: unknown): SttSegment | null {
  if (!isRecord(value) || typeof value.start !== 'number' || typeof value.end !== 'number') {
    return null;
  }

  return {
    start: value.start,
    end: value.end,
    text: typeof value.text === 'string' ? value.text : '',
    ...(typeof value.avg_logprob === 'number' ? { avgLogprob: value.avg_logprob } : {}),
    ...(typeof value.no_speech_prob === 'number' ? { noSpeechProb: value.no_speech_prob } : {}),
    ...(typeof value.compression_ratio === 'number'
      ? { compressionRatio: value.compression_ratio }
      : {}),
  };
}

function computeConfidence(segments: SttSegment[]): number | undefined {
  const weighted = segments
    .filter((segment) => typeof segment.avgLogprob === 'number')
    .map((segment) => {
      const duration = Math.max(0, segment.end - segment.start);
      const probability = Math.exp(segment.avgLogprob ?? 0);
      return {
        duration,
        weightedProbability: probability * duration,
      };
    })
    .filter((item) => item.duration > 0);

  const totalDuration = weighted.reduce((sum, item) => sum + item.duration, 0);
  if (totalDuration <= 0) {
    return undefined;
  }

  const weightedProbability = weighted.reduce((sum, item) => sum + item.weightedProbability, 0);
  return Math.max(0, Math.min(1, weightedProbability / totalDuration));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
