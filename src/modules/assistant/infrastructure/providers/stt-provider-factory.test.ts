import { describe, expect, it, vi } from 'vitest';

const { groqCtor, geminiCtor, mockCtor } = vi.hoisted(() => ({
  groqCtor: vi.fn(),
  geminiCtor: vi.fn(),
  mockCtor: vi.fn(),
}));

vi.mock('./groq-stt-provider', () => ({
  GroqSttProvider: groqCtor.mockImplementation(function GroqCtor() {
    return { name: 'groq' };
  }),
}));

vi.mock('./gemini-stt-provider', () => ({
  GeminiSttProvider: geminiCtor.mockImplementation(function GeminiCtor() {
    return { name: 'gemini' };
  }),
}));

vi.mock('./mock-stt-provider', () => ({
  MockSttProvider: mockCtor.mockImplementation(function MockCtor() {
    return { name: 'mock' };
  }),
}));

import { createSpeechToTextProvider } from './stt-provider-factory';

describe('createSpeechToTextProvider', () => {
  it('forwards configured stt timeout to providers', () => {
    createSpeechToTextProvider({
      provider: 'groq',
      groqModel: 'whisper-large-v3',
      geminiModel: 'gemini-3.8-flash',
      sttTimeoutMs: 45_000,
    });

    expect(groqCtor).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 45_000 }),
    );
  });

  it('uses default timeout when stt timeout is omitted', () => {
    createSpeechToTextProvider({
      provider: 'gemini',
      groqModel: 'whisper-large-v3',
      geminiModel: 'gemini-3.8-flash',
    });

    expect(geminiCtor).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 20_000 }),
    );
  });
});
