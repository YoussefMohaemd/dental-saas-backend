import { z } from 'zod';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import {
  type SpeechToTextProvider,
  type SttResult,
  type SttSegment,
  type VoiceLanguage,
} from './speech-to-text-provider';
import type { DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { EntityCorrector, type EntityAmbiguity } from './entity-corrector';
import { SttVocabularyService, type SttVocabularySnapshot } from './stt-vocabulary-service';

const MIN_AUDIO_BYTES = 1_024;
const MAX_AUDIO_BYTES = 5_000_000;
const ALLOWED_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav']);
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

interface TranscriptionServiceOptions {
  escalationConfidence?: number;
  retryOnLowQuality?: boolean;
  noSpeechProbThreshold?: number;
  lowLogprobThreshold?: number;
  compressionRatioThreshold?: number;
  entityCorrectionEnabled?: boolean;
  sendPatientNames?: boolean;
}

export class TranscriptionService {
  private readonly options: Required<TranscriptionServiceOptions>;
  private readonly entityCorrector: EntityCorrector;
  private readonly vocabularyService: SttVocabularyService | undefined;

  public constructor(
    private readonly providers: {
      primary: SpeechToTextProvider;
      fallback: SpeechToTextProvider;
    },
    dependencies?: {
      vocabularyService?: SttVocabularyService;
      entityCorrector?: EntityCorrector;
    },
    options?: TranscriptionServiceOptions,
  ) {
    this.options = {
      escalationConfidence: options?.escalationConfidence ?? 0.8,
      retryOnLowQuality: options?.retryOnLowQuality ?? true,
      noSpeechProbThreshold: options?.noSpeechProbThreshold ?? 0.6,
      lowLogprobThreshold: options?.lowLogprobThreshold ?? -1,
      compressionRatioThreshold: options?.compressionRatioThreshold ?? 2.4,
      entityCorrectionEnabled: options?.entityCorrectionEnabled ?? false,
      sendPatientNames: options?.sendPatientNames ?? false,
    };
    this.entityCorrector = dependencies?.entityCorrector ?? new EntityCorrector();
    this.vocabularyService = dependencies?.vocabularyService;
  }

  public async transcribe(input: {
    audio: Buffer;
    mimeType: string;
    language?: VoiceLanguage;
    vocabulary?: string[];
    scope?: DataVisibilityScope;
  }): Promise<{ text: string; provider: string; ambiguities?: EntityAmbiguity[] }> {
    const mimeType = normalizeMimeType(input.mimeType);
    validateInput(input.audio, mimeType);
    const language = input.language ?? 'auto';
    const vocabularySnapshot = await this.loadVocabulary(input.scope);
    const providerVocabulary = this.resolveProviderVocabulary(vocabularySnapshot, input.vocabulary);

    const request = {
      audio: input.audio,
      mimeType,
      language,
      vocabulary: providerVocabulary,
    };
    const orderedProviders = this.resolveProviders(language);
    const primaryProvider = orderedProviders[0];
    const fallbackProvider = orderedProviders[1];

    try {
      const primaryResult = await primaryProvider.transcribe(request);
      const processedPrimary = this.postProcess(primaryResult);
      if (
        processedPrimary.shouldEscalate &&
        this.options.retryOnLowQuality &&
        fallbackProvider
      ) {
        const fallbackResult = await fallbackProvider.transcribe(request);
        return {
          ...this.finalizeResult(this.postProcess(fallbackResult).text, vocabularySnapshot),
          provider: fallbackProvider.name,
        };
      }

      return {
        ...this.finalizeResult(processedPrimary.text, vocabularySnapshot),
        provider: primaryProvider.name,
      };
    } catch (error) {
      if (!fallbackProvider || !shouldFallback(error)) {
        throw error;
      }

      const fallbackResult = await fallbackProvider.transcribe(request);
      return {
        ...this.finalizeResult(this.postProcess(fallbackResult).text, vocabularySnapshot),
        provider: fallbackProvider.name,
      };
    }
  }

  private finalizeResult(
    text: string,
    vocabulary: SttVocabularySnapshot | null,
  ): { text: string; ambiguities?: EntityAmbiguity[] } {
    if (!this.options.entityCorrectionEnabled || !vocabulary) {
      return { text };
    }
    const corrected = this.entityCorrector.correct({ text, vocabulary });
    return {
      text: corrected.text,
      ...(corrected.ambiguities.length > 0 ? { ambiguities: corrected.ambiguities } : {}),
    };
  }

  private resolveProviders(language: VoiceLanguage): [SpeechToTextProvider, SpeechToTextProvider?] {
    if (language === 'mixed') {
      if (this.providers.primary.name === 'gemini') {
        return [this.providers.primary, this.providers.fallback];
      }
      if (this.providers.fallback.name === 'gemini') {
        return [this.providers.fallback, this.providers.primary];
      }
    }
    return [this.providers.primary, this.providers.fallback];
  }

  private postProcess(result: SttResult): { text: string; shouldEscalate: boolean } {
    const filteredSegments = filterSegments(result.segments, this.options);
    const textFromSegments = buildSegmentText(filteredSegments);
    const text =
      result.segments && result.segments.length > 0 ? textFromSegments : result.text;
    const likelyNoSpeech =
      (result.segments?.length ?? 0) > 0 && textFromSegments.length === 0;
    const hasHighCompression = (result.segments ?? []).some(
      (segment) =>
        typeof segment.compressionRatio === 'number' &&
        segment.compressionRatio > this.options.compressionRatioThreshold,
    );
    const lowConfidence =
      typeof result.confidence === 'number' &&
      result.confidence < this.options.escalationConfidence;

    return {
      text: normalizeTranscript(text),
      shouldEscalate: !likelyNoSpeech && (lowConfidence || hasHighCompression),
    };
  }

  private resolveProviderVocabulary(
    snapshot: SttVocabularySnapshot | null,
    providedVocabulary: string[] | undefined,
  ): string[] {
    const explicitVocabulary = providedVocabulary ?? [];
    if (!snapshot) {
      return explicitVocabulary;
    }

    const terms = this.options.sendPatientNames
      ? [...snapshot.terms, ...snapshot.patients.map((item) => item.label)]
      : snapshot.terms;
    return [...terms, ...explicitVocabulary];
  }

  private async loadVocabulary(scope: DataVisibilityScope | undefined): Promise<SttVocabularySnapshot | null> {
    if (!scope || !this.vocabularyService) {
      return null;
    }
    return this.vocabularyService.getVocabulary({ scope });
  }
}

function filterSegments(
  segments: SttSegment[] | undefined,
  options: Required<TranscriptionServiceOptions>,
): SttSegment[] {
  if (!segments || segments.length === 0) {
    return [];
  }

  return segments.filter((segment) => {
    const noSpeechProb = segment.noSpeechProb ?? 0;
    const avgLogprob = segment.avgLogprob ?? 0;
    return !(
      noSpeechProb > options.noSpeechProbThreshold &&
      avgLogprob < options.lowLogprobThreshold
    );
  });
}

function buildSegmentText(segments: SttSegment[]): string {
  return segments
    .map((segment) => segment.text?.trim() ?? '')
    .filter((segment) => segment.length > 0)
    .join(' ')
    .trim();
}

export function normalizeTranscript(value: string): string {
  const withoutHallucinations = value
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter((item) => !SILENCE_HALLUCINATIONS.has(item.toLowerCase()))
    .join(' ');
  const normalized = withoutHallucinations
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

export function parseTranscriptionPayload(payload: unknown): SttResult {
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
