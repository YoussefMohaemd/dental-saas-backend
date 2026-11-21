import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeepgramSttProvider } from './deepgram-stt-provider';

describe('DeepgramSttProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('transcribes via Deepgram Nova and maps transcript/language', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            channels: [
              {
                detected_language: 'ar',
                alternatives: [
                  {
                    transcript: 'مرحبا يا دكتور',
                    confidence: 0.92,
                  },
                ],
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new DeepgramSttProvider({
      apiKey: 'deepgram-key',
      model: 'nova-3',
      timeoutMs: 1_000,
    });

    const result = await provider.transcribe({
      audio: Buffer.from('audio'),
      mimeType: 'audio/webm',
      language: 'mixed',
      vocabulary: [],
    });

    expect(result).toEqual({
      text: 'مرحبا يا دكتور',
      language: 'ar',
      confidence: 0.92,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://api.deepgram.com/v1/listen');
    expect(url).toContain('model=nova-3');
    expect(url).toContain('detect_language=true');
    expect(init.headers).toMatchObject({
      Authorization: 'Token deepgram-key',
      'Content-Type': 'audio/webm',
    });
  });
});

