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
import { MongooseAssistantLlmCallRepository } from '../infrastructure/persistence/mongoose/mongoose-assistant-llm-call-repository';
import { AssistantLlmLogService } from './assistant-llm-log-service';
import { PatientService } from '../../patients/application/patient-service';
import { MongoosePatientRepository } from '../../patients/infrastructure/mongoose-patient-repository';
import { AssistantLookupService } from './assistant-lookup-service';
import { TranscriptionService } from './transcription-service';
import { createSpeechToTextProvider } from '../infrastructure/providers/stt-provider-factory';
import { SttVocabularyService } from './stt-vocabulary-service';
import { EntityCorrector } from './entity-corrector';

export function createAssistantLookupService(): AssistantLookupService {
  const patientService = new PatientService(new MongoosePatientRepository());
  const doctorService = new DoctorService(new MongooseDoctorRepository());
  const clinicService = new ClinicService(new MongooseClinicRepository());
  const catalogRepository = new MongooseAssistantCatalogRepository();

  return new AssistantLookupService({
    patients: async (scope) => {
      const result = await patientService.listPatients(
        { scope, search: undefined, sortBy: 'name', sortDirection: 'asc', statuses: [] },
        { page: 1, pageSize: 20 },
      );
      return result.items.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
      }));
    },
    doctors: async (scope, clinicId) => {
      const result = await doctorService.listDoctors(
        {
          scope,
          sortBy: 'name',
          sortDirection: 'asc',
          statuses: [],
          ...(clinicId ? { clinicId } : {}),
        },
        { page: 1, pageSize: 20 },
      );
      return result.items.map((item) => ({
        id: item.id,
        name: item.name,
        specialty: item.specialty,
      }));
    },
    clinics: async (scope) => {
      const result = await clinicService.listClinics(
        { scope, sortBy: 'name', sortDirection: 'asc', statuses: [] },
        { page: 1, pageSize: 20 },
      );
      return result.items.map((item) => ({ id: item.id, name: item.name, city: item.city }));
    },
    services: async (scope) => {
      const services = await catalogRepository.listServices(String(scope.tenantId));
      return services.map((item) => ({
        id: item.serviceId,
        name: item.name,
        description: item.description,
      }));
    },
  });
}

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
  const llmLogService = new AssistantLlmLogService(new MongooseAssistantLlmCallRepository());

  return AssistantService.create({
    provider,
    conversationRepository: new MongooseAssistantConversationRepository(),
    pendingActionRepository: new MongooseAssistantPendingActionRepository(),
    auditRepository: new MongooseAssistantAuditRepository(),
    llmLogService,
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
      createToolsEnabled: env.AI_ASSISTANT_CREATE_TOOLS_ENABLED,
      plannerPromptVersion: env.AI_ASSISTANT_PLANNER_PROMPT_VERSION,
    },
  });
}

export function createTranscriptionService(): TranscriptionService {
  const patientService = new PatientService(new MongoosePatientRepository());
  const doctorService = new DoctorService(new MongooseDoctorRepository());
  const clinicService = new ClinicService(new MongooseClinicRepository());
  const catalogRepository = new MongooseAssistantCatalogRepository();
  const vocabularyService = new SttVocabularyService({
    loadDoctors: async (scope) => {
      const result = await doctorService.listDoctors(
        {
          scope,
          sortBy: 'name',
          sortDirection: 'asc',
          statuses: [],
        },
        { page: 1, pageSize: 50 },
      );
      return result.items.map((item) => ({ id: item.id, label: item.name }));
    },
    loadClinics: async (scope) => {
      const result = await clinicService.listClinics(
        { scope, sortBy: 'name', sortDirection: 'asc', statuses: [] },
        { page: 1, pageSize: 50 },
      );
      return result.items.map((item) => ({ id: item.id, label: item.name }));
    },
    loadServices: async (scope) => {
      const services = await catalogRepository.listServices(String(scope.tenantId));
      return services.map((item) => ({ id: item.serviceId, label: item.name }));
    },
    loadPatients: async (scope) => {
      const result = await patientService.listPatients(
        { scope, search: undefined, sortBy: 'name', sortDirection: 'asc', statuses: [] },
        { page: 1, pageSize: 50 },
      );
      return result.items.map((item) => ({ id: item.id, label: item.name }));
    },
  });

  const baseConfig = {
    groqModel: env.GROQ_STT_MODEL,
    geminiModel: env.STT_GEMINI_MODEL,
    sttTimeoutMs: env.STT_TIMEOUT_MS,
    ...(env.AI_ASSISTANT_GROQ_API_KEY
      ? { groqApiKey: env.AI_ASSISTANT_GROQ_API_KEY }
      : {}),
    ...(env.AI_ASSISTANT_GROQ_BASE_URL
      ? { groqBaseUrl: env.AI_ASSISTANT_GROQ_BASE_URL }
      : {}),
    ...(env.AI_ASSISTANT_GEMINI_API_KEY
      ? { geminiApiKey: env.AI_ASSISTANT_GEMINI_API_KEY }
      : {}),
  };
  const configuredProvider = createSpeechToTextProvider({
    provider: env.STT_PROVIDER,
    ...baseConfig,
  });
  const fallbackProvider =
    configuredProvider.name === 'gemini'
      ? createSpeechToTextProvider({
          provider: 'groq',
          ...baseConfig,
        })
      : createSpeechToTextProvider({
          provider: 'gemini',
          ...baseConfig,
        });

  return new TranscriptionService({
    primary: configuredProvider,
    fallback: fallbackProvider,
  }, {
    vocabularyService,
    entityCorrector: new EntityCorrector(),
  }, {
    totalDeadlineMs: env.STT_TOTAL_DEADLINE_MS,
    maxAttemptsPerProvider: env.STT_MAX_ATTEMPTS_PER_PROVIDER,
    escalationConfidence: env.STT_ESCALATION_CONFIDENCE,
    retryOnLowQuality: env.STT_RETRY_ON_LOW_QUALITY,
    noSpeechProbThreshold: env.STT_NO_SPEECH_PROB_THRESHOLD,
    lowLogprobThreshold: env.STT_LOW_LOGPROB_THRESHOLD,
    compressionRatioThreshold: env.STT_COMPRESSION_RATIO_THRESHOLD,
    entityCorrectionEnabled: env.STT_ENTITY_CORRECTION,
    sendPatientNames: env.STT_SEND_PATIENT_NAMES,
  });
}
