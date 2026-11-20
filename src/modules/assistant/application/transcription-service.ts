import { z } from 'zod';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import {
  type SpeechToTextProvider,
  type SttLanguageHint,
  type SttTranscriptionResult,
} from './speech-to-text-provider';

const MIN_AUDIO_BYTES = 1_024;
const MAX_AUDIO_BYTES = 5_000_000;
const ALLOWED_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav']);
const ARABIC_DIACRITICS_PATTERN = /[\u064b-\u065f\u0670]/g;
const ARABIC_TATWEEL_PATTERN = /\u0640/g;
const WHITESPACE_PATTERN = /\s+/g;
const SPACE_BEFORE_PUNCTUATION_PATTERN = /\s+([،,.!?؟:;])/g;
const SILENCE_HALLUCINATIONS = new Set([
  'thanks for watching',
  'thank you for watching',
  'subscribe to the channel',
]);

const transcriptionResponseSchema = z.object({
  text: z.string(),
});

export class TranscriptionService {
  public constructor(
    private readonly providers: {
      primary: SpeechToTextProvider;
      fallback: SpeechToTextProvider;
    },
  ) {}

  public async transcribe(input: {
    audio: Buffer;
    mimeType: string;
    languageHint?: SttLanguageHint;
  }): Promise<{ text: string; provider: string }> {
    const mimeType = normalizeMimeType(input.mimeType);
    validateInput(input.audio, mimeType);

    try {
      const primaryResult = await this.providers.primary.transcribe({
        audio: input.audio,
        mimeType,
        ...(input.languageHint ? { languageHint: input.languageHint } : {}),
      });
      return {
        text: normalizeTranscript(primaryResult.text),
        provider: this.providers.primary.name,
      };
    } catch (error) {
      if (!shouldFallback(error)) {
        throw error;
      }

      const fallbackResult = await this.providers.fallback.transcribe({
        audio: input.audio,
        mimeType,
        ...(input.languageHint ? { languageHint: input.languageHint } : {}),
      });
      return {
        text: normalizeTranscript(fallbackResult.text),
        provider: this.providers.fallback.name,
      };
    }
  }
}

export function normalizeTranscript(value: string): string {
  const withoutHallucinations = value
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter((item) => !SILENCE_HALLUCINATIONS.has(item.toLowerCase()))
    .join(' ');
  const normalized = withoutHallucinations
    .replace(ARABIC_DIACRITICS_PATTERN, '')
    .replace(ARABIC_TATWEEL_PATTERN, '')
    .replace(SPACE_BEFORE_PUNCTUATION_PATTERN, '$1')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
  if (normalized.length === 0) {
    return '';
  }
  return normalized;
}

export function normalizeMimeType(value: string): string {
  return value.split(';')[0]?.trim().toLowerCase() ?? '';
}

function validateInput(audio: Buffer, mimeType: string): void {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ApplicationError({
      message: `Unsupported audio format: ${mimeType || 'unknown'}`,
      statusCode: 415,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: {
        supportedMimeTypes: [...ALLOWED_MIME_TYPES],
      },
    });
  }

  if (audio.byteLength <= MIN_AUDIO_BYTES) {
    throw new ApplicationError({
      message: 'Audio payload is too small',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: {
        minBytesExclusive: MIN_AUDIO_BYTES,
      },
    });
  }

  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new ApplicationError({
      message: 'Audio payload is too large',
      statusCode: 413,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: {
        maxBytesInclusive: MAX_AUDIO_BYTES,
      },
    });
  }
}

function shouldFallback(error: unknown): boolean {
  if (!(error instanceof ApplicationError)) {
    return false;
  }
  if (error.statusCode === 429) {
    return true;
  }
  if (error.statusCode >= 500 && error.statusCode < 600) {
    return true;
  }
  return false;
}

export function parseTranscriptionPayload(payload: unknown): SttTranscriptionResult {
  const parsed = transcriptionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApplicationError({
      message: 'Invalid transcription response',
      statusCode: 502,
      code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      expose: true,
    });
  }
  return parsed.data;
}
