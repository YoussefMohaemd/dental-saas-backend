import { type AssistantPlanAction, type AssistantToolDefinition } from '../domain/assistant.types';

export interface AssistantLlmCompletionRequest {
  userMessage: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }> | undefined;
  systemPrompt: string;
  tools: AssistantToolDefinition[];
  languageHint: 'ar' | 'en' | 'mixed';
  signal?: AbortSignal;
}

export interface AssistantLlmCompletionResult {
  reply: string;
  actions: AssistantPlanAction[];
}

export interface AssistantLlmProvider {
  name: 'mock' | 'vllm' | 'groq';
  completePlan(request: AssistantLlmCompletionRequest): Promise<AssistantLlmCompletionResult>;
}
