import { env } from '../../../config/env';
import { AssistantService } from './assistant-service';
import { MongooseAssistantAuditRepository } from '../infrastructure/persistence/mongoose/mongoose-assistant-audit-repository';
import { MongooseAssistantConversationRepository } from '../infrastructure/persistence/mongoose/mongoose-assistant-conversation-repository';
import { MongooseAssistantPendingActionRepository } from '../infrastructure/persistence/mongoose/mongoose-assistant-pending-action-repository';
import { createAssistantLlmProvider } from '../infrastructure/providers/llm-provider-factory';
import { OrdersService } from '../../orders/application/orders-service';
import { MongooseOrdersRepository } from '../../orders/infrastructure/mongoose-orders-repository';
import { ClinicService } from '../../clinics/application/clinic-service';
import { MongooseClinicRepository } from '../../clinics/infrastructure/mongoose-clinic-repository';
import { DoctorService } from '../../doctors/application/doctor-service';
import { MongooseDoctorRepository } from '../../doctors/infrastructure/mongoose-doctor-repository';
import { MongooseAssistantCatalogRepository } from '../infrastructure/persistence/mongoose/mongoose-assistant-catalog-repository';
import { PatientService } from '../../patients/application/patient-service';
import { MongoosePatientRepository } from '../../patients/infrastructure/mongoose-patient-repository';

export function createAssistantService(): AssistantService {
  const provider = createAssistantLlmProvider({
    provider: env.AI_ASSISTANT_PROVIDER,
    model:
      env.AI_ASSISTANT_PROVIDER === 'gemini'
        ? env.AI_ASSISTANT_GEMINI_MODEL
        : env.AI_ASSISTANT_MODEL,
    timeoutMs: env.AI_ASSISTANT_TIMEOUT_MS,
    vllmBaseUrl: env.AI_ASSISTANT_VLLM_BASE_URL,
    vllmApiKey: env.AI_ASSISTANT_VLLM_API_KEY,
    groqApiKey: env.AI_ASSISTANT_GROQ_API_KEY,
    groqBaseUrl: env.AI_ASSISTANT_GROQ_BASE_URL,
    groqMaxCompletionTokens: env.AI_ASSISTANT_GROQ_MAX_COMPLETION_TOKENS,
    geminiApiKey: env.AI_ASSISTANT_GEMINI_API_KEY,
    plannerPromptVersion: env.AI_ASSISTANT_PLANNER_PROMPT_VERSION,
  });

  return AssistantService.create({
    provider,
    conversationRepository: new MongooseAssistantConversationRepository(),
    pendingActionRepository: new MongooseAssistantPendingActionRepository(),
    auditRepository: new MongooseAssistantAuditRepository(),
    ordersService: new OrdersService(new MongooseOrdersRepository()),
    patientService: new PatientService(new MongoosePatientRepository()),
    doctorService: new DoctorService(new MongooseDoctorRepository()),
    clinicService: new ClinicService(new MongooseClinicRepository()),
    catalogRepository: new MongooseAssistantCatalogRepository(),
    options: {
      maxActionsPerMessage: env.AI_ASSISTANT_MAX_ACTIONS_PER_MESSAGE,
      maxPlanningRounds: env.AI_ASSISTANT_MAX_PLANNING_ROUNDS,
      maxInputChars: env.AI_ASSISTANT_MAX_INPUT_CHARS,
      confirmationTtlSeconds: env.AI_ASSISTANT_CONFIRMATION_TTL_SECONDS,
    },
  });
}
