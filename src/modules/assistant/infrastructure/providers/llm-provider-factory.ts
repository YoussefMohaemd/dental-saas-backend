import { type AssistantLlmProvider } from '../../application/llm-provider';
import { GeminiAssistantLlmProvider } from './gemini-llm-provider';
import { MockAssistantLlmProvider } from './mock-llm-provider';
import { VllmAssistantLlmProvider } from './vllm-llm-provider';

export interface AssistantLlmProviderConfig {
  provider: 'mock' | 'vllm' | 'gemini';
  model: string;
  timeoutMs: number;
  vllmBaseUrl: string;
  vllmApiKey: string | undefined;
  geminiApiKey: string | undefined;
  geminiBaseUrl: string | undefined;
  plannerPromptVersion: string;
}

export function createAssistantLlmProvider(
  config: AssistantLlmProviderConfig,
): AssistantLlmProvider {
  if (config.provider === 'mock') {
    return new MockAssistantLlmProvider();
  }

  if (config.provider === 'vllm') {
    return new VllmAssistantLlmProvider({
      model: config.model,
      baseUrl: config.vllmBaseUrl,
      ...(config.vllmApiKey ? { apiKey: config.vllmApiKey } : {}),
      timeoutMs: config.timeoutMs,
    });
  }

  if (config.provider === 'gemini') {
    return new GeminiAssistantLlmProvider({
      model: config.model,
      timeoutMs: config.timeoutMs,
      ...(config.geminiApiKey ? { apiKey: config.geminiApiKey } : {}),
      ...(config.geminiBaseUrl ? { baseUrl: config.geminiBaseUrl } : {}),
    });
  }

  throw new Error('Unsupported assistant LLM provider');
}
