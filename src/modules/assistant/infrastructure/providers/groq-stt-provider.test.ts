import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroqSttProvider } from './groq-stt-provider';

describe('GroqSttProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['ar', 'en'] as const)('sends explicit language to Groq when hint is %s', async (hint) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GroqSttProvider({ apiKey: 'test-key', model: 'whisper-large-v3' });

    await provider.transcribe({
      audio: Buffer.from('audio'),
      mimeType: 'audio/webm',
      languageHint: hint,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;

    expect(body.get('language')).toBe(hint);
  });

  it('does not send language to Groq for auto and mixed hints', async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ text: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GroqSttProvider({ apiKey: 'test-key', model: 'whisper-large-v3' });

    await provider.transcribe({
      audio: Buffer.from('audio'),
      mimeType: 'audio/webm',
      languageHint: 'mixed',
    });
    await provider.transcribe({
      audio: Buffer.from('audio'),
      mimeType: 'audio/webm',
      languageHint: 'auto',
    });

    const mixedBody = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    const autoBody = fetchMock.mock.calls[1]?.[1]?.body as FormData;
    expect(mixedBody.get('language')).toBeNull();
    expect(autoBody.get('language')).toBeNull();
  });

  it('requests verbose_json and maps segments/quality fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: 'مرحبا world',
          language: 'ar',
          segments: [
            {
              start: 0.0,
              end: 1.0,
              avg_logprob: -0.1,
              no_speech_prob: 0.02,
              compression_ratio: 1.3,
              text: 'مرحبا',
            },
            {
              start: 1.0,
              end: 3.0,
              avg_logprob: -0.2,
              no_speech_prob: 0.05,
              compression_ratio: 1.4,
              text: 'world',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GroqSttProvider({ apiKey: 'test-key', model: 'whisper-large-v3' });

    const result = await provider.transcribe({
      audio: Buffer.from('audio'),
      mimeType: 'audio/webm',
      languageHint: 'ar',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.get('response_format')).toBe('verbose_json');
    expect(result.text).toBe('مرحبا world');
    expect(result.detectedLanguage).toBe('ar');
    expect(result.confidence).toBeCloseTo(0.8474, 4);
    expect(result.segments).toEqual([
      {
        start: 0,
        end: 1,
        avgLogprob: -0.1,
        noSpeechProb: 0.02,
        compressionRatio: 1.3,
        text: 'مرحبا',
      },
      {
        start: 1,
        end: 3,
        avgLogprob: -0.2,
        noSpeechProb: 0.05,
        compressionRatio: 1.4,
        text: 'world',
      },
    ]);
  });
});
