import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../../shared/application/errors/application-error';
import { type SpeechToTextProvider } from '../../application/speech-to-text-provider';
import { DeepgramSttProvider } from './deepgram-stt-provider';
import { GeminiSttProvider } from './gemini-stt-provider';
import { GroqSttProvider } from './groq-stt-provider';
import { MockSttProvider } from './mock-stt-provider';

export function createSpeechToTextProvider(config: {
  provider: 'groq' | 'gemini' | 'deepgram' | 'mock';
  groqApiKey?: string;
  groqBaseUrl?: string;
  groqModel: string;
  deepgramApiKey?: string;
  deepgramModel?: string;
  geminiApiKey?: string;
  geminiModel: string;
  sttTimeoutMs?: number;
}): SpeechToTextProvider {
  if (config.provider === 'mock') {
    return new MockSttProvider();
  }

  if (config.provider === 'groq') {
    return new GroqSttProvider({
      model: config.groqModel,
      timeoutMs: config.sttTimeoutMs ?? 20_000,
      ...(config.groqApiKey ? { apiKey: config.groqApiKey } : {}),
      ...(config.groqBaseUrl ? { baseUrl: config.groqBaseUrl } : {}),
    });
  }

  if (config.provider === 'gemini') {
    return new GeminiSttProvider({
      model: config.geminiModel,
      timeoutMs: config.sttTimeoutMs ?? 20_000,
      ...(config.geminiApiKey ? { apiKey: config.geminiApiKey } : {}),
    });
  }

  if (config.provider === 'deepgram') {
    return new DeepgramSttProvider({
      model: config.deepgramModel ?? 'nova-3',
      timeoutMs: config.sttTimeoutMs ?? 20_000,
      ...(config.deepgramApiKey ? { apiKey: config.deepgramApiKey } : {}),
    });
  }

  throw new ApplicationError({
    message: 'Unsupported speech-to-text provider',
    statusCode: 500,
    code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
  });
}
