import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../../shared/application/errors/application-error';
import {
  type SpeechToTextProvider,
  type SttRequest,
  type SttResult,
} from '../../application/speech-to-text-provider';

interface DeepgramSttProviderOptions {
  apiKey?: string;
  model: string;
  timeoutMs?: number;
}

export class DeepgramSttProvider implements SpeechToTextProvider {
  public readonly name = 'deepgram' as const;

  public constructor(private readonly options: DeepgramSttProviderOptions) {}

  public async transcribe(input: SttRequest): Promise<SttResult> {
    if (!this.options.apiKey) {
      throw new ApplicationError({
        message: 'Deepgram STT provider is missing API key',
        statusCode: 500,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      });
    }

    const timeoutSignal = AbortSignal.timeout(this.options.timeoutMs ?? 20_000);
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    const url = buildDeepgramUrl(this.options.model, input.language);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.options.apiKey}`,
          'Content-Type': input.mimeType,
        },
        body: new Blob([new Uint8Array(input.audio)], { type: input.mimeType }),
        signal,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new ApplicationError({
          message: `Deepgram transcription request failed (${response.status})`,
          statusCode:
            response.status === 429 || response.status === 503 ? response.status : 502,
          code:
            response.status === 429
              ? APPLICATION_ERROR_CODES.RATE_LIMITED
              : APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: response.status === 429,
          details: {
            upstream: 'deepgram',
            status: response.status,
            statusText: response.statusText,
            ...(message ? { message: message.slice(0, 1_000) } : {}),
          },
        });
      }

      const payload = (await response.json()) as unknown;
      return parseDeepgramPayload(payload);
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new ApplicationError({
          message: 'Deepgram transcription request timed out',
          statusCode: 504,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: true,
        });
      }
      throw new ApplicationError({
        message: 'Deepgram transcription request failed',
        statusCode: 502,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
        details: {
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

function buildDeepgramUrl(model: string, language: SttRequest['language']): string {
  const params = new URLSearchParams({
    model,
    smart_format: 'true',
    punctuate: 'true',
  });

  if (language === 'ar' || language === 'en') {
    params.set('language', language);
  } else {
    params.set('detect_language', 'true');
  }

  return `https://api.deepgram.com/v1/listen?${params.toString()}`;
}

function parseDeepgramPayload(payload: unknown): SttResult {
  const channel = isRecord(payload) &&
    isRecord(payload.results) &&
    Array.isArray(payload.results.channels) &&
    payload.results.channels.length > 0 &&
    isRecord(payload.results.channels[0])
    ? payload.results.channels[0]
    : null;
  const alternative =
    channel && Array.isArray(channel.alternatives) && channel.alternatives.length > 0
      ? channel.alternatives[0]
      : null;

  const text =
    alternative && isRecord(alternative) && typeof alternative.transcript === 'string'
      ? alternative.transcript
      : '';

  return {
    text,
    ...(channel && typeof channel.detected_language === 'string'
      ? { language: channel.detected_language }
      : {}),
    ...(alternative && isRecord(alternative) && typeof alternative.confidence === 'number'
      ? { confidence: alternative.confidence }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

