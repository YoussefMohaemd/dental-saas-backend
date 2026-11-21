import { describe, expect, it, vi } from 'vitest';

import { GeminiSttProvider } from './gemini-stt-provider';

describe('GeminiSttProvider', () => {
  it('Gemini returns structured {text, language} JSON and parses it', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"text":"مرحبا يا دكتور","language":"ar"}',
    });
    const provider = new GeminiSttProvider({
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      client: { models: { generateContent } },
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
    });

    const request = generateContent.mock.calls[0]?.[0] as {
      contents: Array<{ parts: Array<{ text?: string }> }>;
    };
    expect(request.contents[0]?.parts[0]?.text).toContain('Return strict JSON');
    expect(request.contents[0]?.parts[0]?.text).toContain('"text"');
    expect(request.contents[0]?.parts[0]?.text).toContain('"language"');
    expect(request.contents[0]?.parts[0]?.text).toContain('"mixed"');
  });

  it('does not add a language hint for auto mode', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"text":"hello","language":"en"}',
    });
    const provider = new GeminiSttProvider({
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      client: { models: { generateContent } },
    });

    await provider.transcribe({
      audio: Buffer.from('audio'),
      mimeType: 'audio/webm',
      language: 'auto',
      vocabulary: [],
    });

    const request = generateContent.mock.calls[0]?.[0] as {
      contents: Array<{ parts: Array<{ text?: string }> }>;
    };
    expect(request.contents[0]?.parts[0]?.text).not.toContain('Primary language hint');
  });
});
