import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import {
  type SpeechToTextProvider,
  type SttRequest,
  type SttResult,
} from './speech-to-text-provider';
import { TranscriptionService } from './transcription-service';

describe('TranscriptionService', () => {
  const audio = Buffer.alloc(2_048, 1);

  it('falls back to Gemini when Groq is rate-limited', async () => {
    const groq = provider('groq', () =>
      Promise.reject(appError(429, 'GROQ_RATE_LIMITED')),
    );
    const gemini = provider('gemini', () =>
      Promise.resolve({ text: 'hello from gemini' }),
    );

    const service = new TranscriptionService({ primary: groq, fallback: gemini });
    await expect(service.transcribe({ audio, mimeType: 'audio/webm' })).resolves.toEqual({
      provider: 'gemini',
      text: 'hello from gemini',
    });
  });

  it('falls back to Gemini when Groq times out', async () => {
    const groq = provider('groq', () =>
      Promise.reject(appError(504, 'GROQ_TIMEOUT')),
    );
    const gemini = provider('gemini', () =>
      Promise.resolve({ text: 'timeout fallback' }),
    );

    const service = new TranscriptionService({ primary: groq, fallback: gemini });
    await expect(service.transcribe({ audio, mimeType: 'audio/webm' })).resolves.toEqual({
      provider: 'gemini',
      text: 'timeout fallback',
    });
  });

  it('escalates to fallback when confidence is below threshold', async () => {
    const primaryTranscribe = vi
      .fn<(input: SttRequest) => Promise<SttResult>>()
      .mockResolvedValue({ text: 'low quality', confidence: 0.3 });
    const fallbackTranscribe = vi
      .fn<(input: SttRequest) => Promise<SttResult>>()
      .mockResolvedValue({ text: 'high quality fallback' });

    const service = new TranscriptionService(
      {
        primary: { name: 'groq', transcribe: primaryTranscribe },
        fallback: { name: 'gemini', transcribe: fallbackTranscribe },
      },
      undefined,
      { escalationConfidence: 0.8, retryOnLowQuality: true },
    );

    await expect(service.transcribe({ audio, mimeType: 'audio/webm' })).resolves.toEqual({
      provider: 'gemini',
      text: 'high quality fallback',
    });
  });

  it('routes mixed hint directly to gemini primary path', async () => {
    const primaryTranscribe = vi
      .fn<(input: SttRequest) => Promise<SttResult>>()
      .mockResolvedValue({ text: 'should not run first' });
    const fallbackTranscribe = vi
      .fn<(input: SttRequest) => Promise<SttResult>>()
      .mockResolvedValue({ text: 'mixed output from gemini' });

    const service = new TranscriptionService({
      primary: { name: 'groq', transcribe: primaryTranscribe },
      fallback: { name: 'gemini', transcribe: fallbackTranscribe },
    });

    await expect(
      service.transcribe({ audio, mimeType: 'audio/webm', language: 'mixed' }),
    ).resolves.toEqual({
      provider: 'gemini',
      text: 'mixed output from gemini',
    });
    expect(fallbackTranscribe).toHaveBeenCalledTimes(1);
    expect(primaryTranscribe).not.toHaveBeenCalled();
  });

  it('does not fallback for unsupported mime type', async () => {
    const service = new TranscriptionService({
      primary: provider('groq', () => Promise.resolve({ text: 'unused' })),
      fallback: provider('gemini', () => Promise.resolve({ text: 'unused fallback' })),
    });

    await expect(
      service.transcribe({ audio, mimeType: 'application/octet-stream' }),
    ).rejects.toMatchObject({
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      statusCode: 415,
    });
  });

  it('rejects too-small payloads', async () => {
    const service = new TranscriptionService({
      primary: provider('groq', () => Promise.resolve({ text: 'unused' })),
      fallback: provider('gemini', () => Promise.resolve({ text: 'unused fallback' })),
    });

    await expect(
      service.transcribe({ audio: Buffer.alloc(512), mimeType: 'audio/webm' }),
    ).rejects.toMatchObject({
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      statusCode: 400,
    });
  });

  it('rejects too-large payloads', async () => {
    const service = new TranscriptionService({
      primary: provider('groq', () => Promise.resolve({ text: 'unused' })),
      fallback: provider('gemini', () => Promise.resolve({ text: 'unused fallback' })),
    });

    await expect(
      service.transcribe({ audio: Buffer.alloc(5_000_001), mimeType: 'audio/webm' }),
    ).rejects.toMatchObject({
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      statusCode: 413,
    });
  });

  it('drops low-quality no-speech segments and returns empty text safely', async () => {
    const service = new TranscriptionService(
      {
        primary: provider('groq', () =>
          Promise.resolve({
            text: 'Thanks for watching',
            segments: [
              {
                start: 0,
                end: 1,
                text: 'Thanks for watching',
                noSpeechProb: 0.95,
                avgLogprob: -2,
              },
            ],
          }),
        ),
        fallback: provider('gemini', () => Promise.resolve({ text: 'unused fallback' })),
      },
      undefined,
      { retryOnLowQuality: false, noSpeechProbThreshold: 0.6, lowLogprobThreshold: -1 },
    );

    await expect(service.transcribe({ audio, mimeType: 'audio/webm' })).resolves.toEqual({
      provider: 'groq',
      text: '',
    });
  });

  it('does not remove Arabic diacritics in final transcript', async () => {
    const service = new TranscriptionService({
      primary: provider('groq', () => Promise.resolve({
        text: 'السَّلامُ   عليكم',
      })),
      fallback: provider('gemini', () => Promise.resolve({ text: 'unused fallback' })),
    });

    await expect(service.transcribe({ audio, mimeType: 'audio/webm' })).resolves.toEqual({
      provider: 'groq',
      text: 'السَّلامُ عليكم',
    });
  });

  it('accepts audio/webm mime values with codecs suffix', async () => {
    const service = new TranscriptionService({
      primary: provider('groq', () => Promise.resolve({ text: 'ok' })),
      fallback: provider('gemini', () => Promise.resolve({ text: 'unused fallback' })),
    });

    await expect(
      service.transcribe({ audio, mimeType: 'audio/webm;codecs=opus' }),
    ).resolves.toEqual({
      provider: 'groq',
      text: 'ok',
    });
  });

  it('forwards the default auto language and empty vocabulary to the primary provider', async () => {
    const primaryTranscribe = vi
      .fn<(input: SttRequest) => Promise<SttResult>>()
      .mockResolvedValue({ text: 'ok' });
    const service = new TranscriptionService({
      primary: { name: 'groq', transcribe: primaryTranscribe },
      fallback: provider('gemini', () => Promise.resolve({ text: 'unused fallback' })),
    });

    await service.transcribe({ audio, mimeType: 'audio/webm' });

    expect(primaryTranscribe).toHaveBeenCalledWith({
      audio,
      mimeType: 'audio/webm',
      language: 'auto',
      vocabulary: [],
    });
  });

  it('forwards explicit language and vocabulary to both providers', async () => {
    const primaryTranscribe = vi
      .fn<(input: SttRequest) => Promise<SttResult>>()
      .mockRejectedValue(appError(429, 'GROQ_RATE_LIMITED'));
    const fallbackTranscribe = vi
      .fn<(input: SttRequest) => Promise<SttResult>>()
      .mockResolvedValue({ text: 'ok' });
    const service = new TranscriptionService({
      primary: { name: 'groq', transcribe: primaryTranscribe },
      fallback: { name: 'gemini', transcribe: fallbackTranscribe },
    });

    await service.transcribe({
      audio,
      mimeType: 'audio/webm',
      language: 'ar',
      vocabulary: ['تاج', 'crown'],
    });

    const expectedRequest = {
      audio,
      mimeType: 'audio/webm',
      language: 'ar',
      vocabulary: ['تاج', 'crown'],
    };
    expect(primaryTranscribe).toHaveBeenCalledWith(expectedRequest);
    expect(fallbackTranscribe).toHaveBeenCalledWith(expectedRequest);
  });

  it('applies local entity correction and returns ambiguities when feature is enabled', async () => {
    const primaryTranscribe = vi
      .fn<(input: SttRequest) => Promise<SttResult>>()
      .mockResolvedValue({ text: 'book with ahmedd' });
    const vocabularyService = {
      getVocabulary: vi.fn().mockResolvedValue({
        terms: ['crown'],
        doctors: [{ id: 'd1', label: 'Ahmed' }],
        clinics: [],
        services: [],
        patients: [{ id: 'p1', label: 'Youssef' }],
      }),
    };
    const entityCorrector = {
      correct: vi.fn().mockReturnValue({
        text: 'book with Ahmed',
        ambiguities: [
          {
            kind: 'doctor',
            candidates: [
              { id: 'd1', label: 'Ahmed' },
              { id: 'd2', label: 'Ahmad' },
            ],
          },
        ],
      }),
    };
    const service = new TranscriptionService(
      {
        primary: { name: 'groq', transcribe: primaryTranscribe },
        fallback: provider('gemini', () => Promise.resolve({ text: 'unused fallback' })),
      },
      {
        vocabularyService: vocabularyService as never,
        entityCorrector: entityCorrector as never,
      },
      { entityCorrectionEnabled: true },
    );
    const scope = {
      tenantId: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      isAdmin: true,
    };

    await expect(
      service.transcribe({ audio, mimeType: 'audio/webm', scope }),
    ).resolves.toEqual({
      provider: 'groq',
      text: 'book with Ahmed',
      ambiguities: [
        {
          kind: 'doctor',
          candidates: [
            { id: 'd1', label: 'Ahmed' },
            { id: 'd2', label: 'Ahmad' },
          ],
        },
      ],
    });
    expect(vocabularyService.getVocabulary).toHaveBeenCalledWith({ scope });
    expect(entityCorrector.correct).toHaveBeenCalled();
  });

  it('does not send patient names to provider vocabulary by default', async () => {
    const primaryTranscribe = vi
      .fn<(input: SttRequest) => Promise<SttResult>>()
      .mockResolvedValue({ text: 'ok' });
    const vocabularyService = {
      getVocabulary: vi.fn().mockResolvedValue({
        terms: ['crown', 'Dr Ahmed'],
        doctors: [{ id: 'd1', label: 'Dr Ahmed' }],
        clinics: [],
        services: [],
        patients: [{ id: 'p1', label: 'Youssef' }],
      }),
    };
    const service = new TranscriptionService(
      {
        primary: { name: 'groq', transcribe: primaryTranscribe },
        fallback: provider('gemini', () => Promise.resolve({ text: 'unused fallback' })),
      },
      {
        vocabularyService: vocabularyService as never,
      },
      { entityCorrectionEnabled: true, sendPatientNames: false },
    );
    const scope = {
      tenantId: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      isAdmin: true,
    };

    await service.transcribe({ audio, mimeType: 'audio/webm', scope });

    expect(primaryTranscribe).toHaveBeenCalledWith({
      audio,
      mimeType: 'audio/webm',
      language: 'auto',
      vocabulary: ['crown', 'Dr Ahmed'],
    });
  });
});

function provider(
  name: SpeechToTextProvider['name'],
  transcribe: SpeechToTextProvider['transcribe'],
): SpeechToTextProvider {
  return { name, transcribe };
}

function appError(statusCode: number, code: string): ApplicationError {
  return new ApplicationError({
    message: code,
    statusCode,
    code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
    expose: true,
    details: { code },
  });
}
