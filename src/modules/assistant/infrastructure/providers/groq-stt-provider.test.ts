import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroqSttProvider } from './groq-stt-provider';

describe('GroqSttProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['ar', 'en'] as const)('sends explicit language to Groq when language is %s', async (language) => {
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
      language,
      vocabulary: [],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;

    expect(body.get('language')).toBe(language);
  });

  it('does not send language to Groq for auto and mixed modes', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ text: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GroqSttProvider({ apiKey: 'test-key', model: 'whisper-large-v3' });

    await provider.transcribe({
      audio: Buffer.from('audio'),
      mimeType: 'audio/webm',
      language: 'mixed',
      vocabulary: [],
    });
    await provider.transcribe({
      audio: Buffer.from('audio'),
      mimeType: 'audio/webm',
      language: 'auto',
      vocabulary: [],
    });

    const [mixedCall, autoCall] = fetchMock.mock.calls as Array<[string, RequestInit]>;
    const mixedBody = mixedCall?.[1].body as FormData;
    const autoBody = autoCall?.[1].body as FormData;
    expect(mixedBody.get('language')).toBeNull();
    expect(autoBody.get('language')).toBeNull();
  });

  it('does not send vocabulary to Groq', async () => {
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
      language: 'ar',
      vocabulary: ['تاج', 'crown'],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;

    expect(body.get('vocabulary')).toBeNull();
    expect(body.get('prompt')).not.toContain('تاج');
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
      language: 'ar',
      vocabulary: [],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.get('response_format')).toBe('verbose_json');
    expect(result.text).toBe('مرحبا world');
    expect(result.language).toBe('ar');
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
