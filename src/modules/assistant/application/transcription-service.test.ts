import { describe, expect, it } from 'vitest';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { type SpeechToTextProvider } from './speech-to-text-provider';
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

  it('normalizes Arabic diacritics/tatweel and strips silence hallucination', async () => {
    const service = new TranscriptionService({
      primary: provider('groq', () => Promise.resolve({
        text: 'الــــسَّلامُ   عليكم  \nThanks for watching',
      })),
      fallback: provider('gemini', () => Promise.resolve({ text: 'unused fallback' })),
    });

    await expect(service.transcribe({ audio, mimeType: 'audio/webm' })).resolves.toEqual({
      provider: 'groq',
      text: 'السلام عليكم',
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
