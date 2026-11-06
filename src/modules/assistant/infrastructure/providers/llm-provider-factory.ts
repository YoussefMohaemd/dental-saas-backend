import { type AssistantLlmProvider } from '../../application/llm-provider';
import { GroqAssistantLlmProvider } from './groq-llm-provider';
import { MockAssistantLlmProvider } from './mock-llm-provider';
import { VllmAssistantLlmProvider } from './vllm-llm-provider';

export interface AssistantLlmProviderConfig {
  provider: 'mock' | 'vllm' | 'groq';
  model: string;
  timeoutMs: number;
  vllmBaseUrl: string;
  vllmApiKey: string | undefined;
  groqApiKey: string | undefined;
  groqBaseUrl: string | undefined;
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


  if (config.provider === 'groq') {
    if (!config.groqApiKey) {
      throw new Error('Groq provider requires AI_ASSISTANT_GROQ_API_KEY');
    }

    return new GroqAssistantLlmProvider({
      model: config.model,
      timeoutMs: config.timeoutMs,
      apiKey: config.groqApiKey,
      ...(config.groqBaseUrl ? { baseUrl: config.groqBaseUrl } : {}),
    });
  }

  throw new Error('Unsupported assistant LLM provider');
}
