import { env } from '../../../config/env';
import { AssistantService } from './assistant-service';
import { MongooseAssistantAuditRepository } from '../infrastructure/persistence/mongoose/mongoose-assistant-audit-repository';
import { MongooseAssistantConversationRepository } from '../infrastructure/persistence/mongoose/mongoose-assistant-conversation-repository';
import { MongooseAssistantPendingActionRepository } from '../infrastructure/persistence/mongoose/mongoose-assistant-pending-action-repository';
import { createAssistantLlmProvider } from '../infrastructure/providers/llm-provider-factory';

export function createAssistantService(): AssistantService {
  const provider = createAssistantLlmProvider({
    provider: env.AI_ASSISTANT_PROVIDER,
    model: env.AI_ASSISTANT_MODEL,
    timeoutMs: env.AI_ASSISTANT_TIMEOUT_MS,
    vllmBaseUrl: env.AI_ASSISTANT_VLLM_BASE_URL,
    vllmApiKey: env.AI_ASSISTANT_VLLM_API_KEY,
    geminiApiKey: env.AI_ASSISTANT_GEMINI_API_KEY,
    geminiBaseUrl: env.AI_ASSISTANT_GEMINI_BASE_URL,
    plannerPromptVersion: env.AI_ASSISTANT_PLANNER_PROMPT_VERSION,
  });

  return AssistantService.create({
    provider,
    conversationRepository: new MongooseAssistantConversationRepository(),
    pendingActionRepository: new MongooseAssistantPendingActionRepository(),
    auditRepository: new MongooseAssistantAuditRepository(),
    options: {
      maxActionsPerMessage: env.AI_ASSISTANT_MAX_ACTIONS_PER_MESSAGE,
      maxPlanningRounds: env.AI_ASSISTANT_MAX_PLANNING_ROUNDS,
      maxInputChars: env.AI_ASSISTANT_MAX_INPUT_CHARS,
      confirmationTtlSeconds: env.AI_ASSISTANT_CONFIRMATION_TTL_SECONDS,
    },
  });
}
