import { randomUUID } from 'node:crypto';

import { resolveRoleCapabilities } from '../../auth/application/authorization-policy';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { ActionPlanner } from './action-planner';
import { formatExecutionsAsMarkdown } from './assistant-result-formatter';
import {
  type AssistantCatalogRepository,
  EmptyAssistantCatalogRepository,
} from './assistant-catalog';
import {
  AssistantActionExecutor,
  type AssistantActionExecutionSummary,
} from './assistant-action-executor';
import {
  type AssistantAuditRepository,
  type AssistantConversationRepository,
  type AssistantPendingActionRepository,
} from './assistant-repositories';
import { AssistantAuditService } from './assistant-audit-service';
import { ConfirmationService } from './confirmation-service';
import { ConversationService } from './conversation-service';
import {
  type AssistantLlmCompletionRequest,
  type AssistantLlmCompletionResult,
  type AssistantLlmProvider,
} from './llm-provider';
import { PermissionGuard } from './permission-guard';
import { PromptCatalogService, type AssistantPromptSuggestion } from './prompt-catalog-service';
import { buildAssistantToolRegistry, type AssistantToolRegistry } from './tool-registry';
import {
  InMemoryAssistantAuditRepository,
  InMemoryAssistantConversationRepository,
  InMemoryAssistantPendingActionRepository,
} from '../infrastructure/persistence/in-memory-assistant-repositories';
import { MockAssistantLlmProvider } from '../infrastructure/providers/mock-llm-provider';
import { type AssistantPlanAction } from '../domain/assistant.types';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { type OrdersService } from '../../orders/application/orders-service';
import { type PatientService } from '../../patients/application/patient-service';
import { type DoctorService } from '../../doctors/application/doctor-service';
import { type ClinicService } from '../../clinics/application/clinic-service';

interface AssistantOptions {
  maxActionsPerMessage: number;
  maxPlanningRounds: number;
  maxInputChars: number;
  confirmationTtlSeconds: number;
  createToolsEnabled?: boolean;
}

export interface AssistantPrincipalContext {
  tenantId: string;
  userId: string;
  roles: string[];
  scope: DataVisibilityScope;
}

interface AssistantServiceDependencies {
  provider: AssistantLlmProvider;
  toolRegistry: AssistantToolRegistry;
  promptCatalogService: PromptCatalogService;
  permissionGuard: PermissionGuard;
  actionPlanner: ActionPlanner;
  actionExecutor: AssistantActionExecutor;
  conversationService: ConversationService;
  confirmationService: ConfirmationService;
  auditService: AssistantAuditService;
  options: AssistantOptions;
  createToolsEnabled: boolean;
}

export interface AssistantConversationView {
  id: string;
  title: string;
  status: 'active' | 'pending_confirmation';
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    text: string;
    resultType: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface AssistantConversationSummaryView {
  id: string;
  title: string;
  status: 'active' | 'pending_confirmation';
  createdAt: string;
  updatedAt: string;
  preview: string;
}

export interface AssistantCapabilitiesView {
  createEnabled: boolean;
}

export interface AssistantMessageResultText {
  type: 'text';
  text: string;
  plannedActions: number;
  executions: AssistantActionExecutionSummary[];
}

export interface AssistantMessageResultConfirmation {
  type: 'confirmation';
  text: string;
  pendingActions: Array<{
    actionId: string;
    tool: string;
    expiresAt: string;
    confirmationToken: string;
    payload: Record<string, unknown>;
  }>;
}

export type AssistantMessageResult = AssistantMessageResultText | AssistantMessageResultConfirmation;

export class AssistantService {
  public constructor(private readonly dependencies: AssistantServiceDependencies) {}

  public static createForTests(params?: {
    providerReply?: AssistantLlmCompletionResult;
    createToolsEnabled?: boolean;
  }): AssistantService {
    const provider = params?.providerReply
      ? new DeterministicTestProvider(params.providerReply)
      : new MockAssistantLlmProvider();
    const conversationRepository = new InMemoryAssistantConversationRepository();
    const pendingActionRepository = new InMemoryAssistantPendingActionRepository();
    const auditRepository = new InMemoryAssistantAuditRepository();

    return AssistantService.create({
      provider,
      conversationRepository,
      pendingActionRepository,
      auditRepository,
      ordersService: new NoopOrdersServiceForTests() as unknown as OrdersService,
      patientService: new NoopPatientsServiceForTests() as unknown as PatientService,
      doctorService: new NoopDoctorsServiceForTests() as unknown as DoctorService,
      clinicService: new NoopClinicsServiceForTests() as unknown as ClinicService,
      options: {
        maxActionsPerMessage: 8,
        maxPlanningRounds: 4,
        maxInputChars: 4_000,
        confirmationTtlSeconds: 900,
        createToolsEnabled: params?.createToolsEnabled ?? true,
      },
    });
  }

  public static create(params: {
    provider: AssistantLlmProvider;
    conversationRepository: AssistantConversationRepository;
    pendingActionRepository: AssistantPendingActionRepository;
    auditRepository: AssistantAuditRepository;
    ordersService: OrdersService;
    patientService: PatientService;
    doctorService: DoctorService;
    clinicService: ClinicService;
    catalogRepository?: AssistantCatalogRepository;
    options: AssistantOptions;
    createToolsEnabled?: boolean;
  }): AssistantService {
    const createToolsEnabled =
      params.createToolsEnabled ?? params.options.createToolsEnabled ?? true;
    const promptCatalogService = new PromptCatalogService();
    const permissionGuard = new PermissionGuard();
    const actionPlanner = new ActionPlanner({
      maxActionsPerMessage: params.options.maxActionsPerMessage,
      maxPlanningRounds: params.options.maxPlanningRounds,
    });
    const conversationService = new ConversationService(params.conversationRepository);
    const confirmationService = new ConfirmationService(
      params.pendingActionRepository,
      params.options.confirmationTtlSeconds,
    );
    const actionExecutor = new AssistantActionExecutor({
      ordersService: params.ordersService,
      patientService: params.patientService,
      doctorService: params.doctorService,
      clinicService: params.clinicService,
      catalogRepository: params.catalogRepository ?? new EmptyAssistantCatalogRepository(),
    });
    const auditService = new AssistantAuditService(params.auditRepository);

    return new AssistantService({
      provider: params.provider,
      toolRegistry: buildAssistantToolRegistry({ createToolsEnabled }),
      promptCatalogService,
      permissionGuard,
      actionPlanner,
      actionExecutor,
      conversationService,
      confirmationService,
      auditService,
      options: params.options,
      createToolsEnabled,
    });
  }

  public getCapabilities(): AssistantCapabilitiesView {
    return { createEnabled: this.dependencies.createToolsEnabled };
  }

  public getSuggestions(
    principal: AssistantPrincipalContext,
  ): Promise<AssistantPromptSuggestion[]> {
    const effectiveCapabilities = new Set(resolveRoleCapabilities(principal.roles));
    const suggestions = this.dependencies.promptCatalogService
      .listSuggestions()
      .filter((suggestion) => suggestion.enabled)
      .filter((suggestion) =>
        this.dependencies.permissionGuard.hasRequiredCapabilities(
          effectiveCapabilities,
          suggestion.requiredCapabilities,
          'all',
        ),
      );

    return Promise.resolve(suggestions);
  }

  public async createConversation(input: {
    tenantId: string;
    userId: string;
    roles: string[];
    title?: string;
  }): Promise<AssistantConversationView> {
    const created = await this.dependencies.conversationService.createConversation({
      tenantId: input.tenantId,
      userId: input.userId,
      ...(input.title ? { title: input.title } : {}),
    });

    return toConversationView(created);
  }

  public async listConversations(
    principal: AssistantPrincipalContext,
    input?: {
      limit?: number;
    },
  ): Promise<AssistantConversationSummaryView[]> {
    const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100);
    const records = await this.dependencies.conversationService.listOwnedConversations({
      tenantId: principal.tenantId,
      userId: principal.userId,
      limit,
    });

    return records.map((record) => ({
      id: record.conversationId,
      title: record.title,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      preview: record.messages.at(-1)?.text ?? '',
    }));
  }

  public async getConversation(
    principal: AssistantPrincipalContext,
    conversationId: string,
  ): Promise<AssistantConversationView> {
    const record = await this.dependencies.conversationService.getOwnedConversation({
      conversationId,
      tenantId: principal.tenantId,
      userId: principal.userId,
    });
    return toConversationView(record);
  }

  public async postMessage(
    principal: AssistantPrincipalContext,
    input: {
      conversationId: string;
      content: string;
    },
  ): Promise<{
    conversationId: string;
    messageId: string;
    result: AssistantMessageResult;
  }> {
    const content = input.content.trim();
    if (content.length === 0) {
      throw new ApplicationError({
        message: 'Message content is required',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }

    if (content.length > this.dependencies.options.maxInputChars) {
      throw new ApplicationError({
        message: 'Message content exceeds allowed length',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
        details: {
          maxInputChars: this.dependencies.options.maxInputChars,
        },
      });
    }

    const existingConversation = await this.dependencies.conversationService.getOwnedConversation({
      conversationId: input.conversationId,
      tenantId: principal.tenantId,
      userId: principal.userId,
    });
    const history = buildHistory(existingConversation.messages);

    const userMessage = await this.dependencies.conversationService.appendMessage({
      conversationId: input.conversationId,
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: 'user',
      text: content,
      resultType: 'text',
    });
    await this.dependencies.auditService.recordEvent({
      tenantId: principal.tenantId,
      userId: principal.userId,
      conversationId: input.conversationId,
      messageId: userMessage.id,
      eventType: 'assistant.message.received',
      status: 'success',
    });

    const effectiveCapabilities = new Set(resolveRoleCapabilities(principal.roles));
    const llmCompletion = await this.completePlanWithFallback(content, history);

    const plannedActions = llmCompletion.actions;
    const actions = this.dependencies.actionPlanner.validatePlan({
      intent: plannedActions.length > 1 ? 'multiple_actions' : 'single_action',
      actions: plannedActions,
    }).actions;
    const normalizedActions = actions.map((action) => ({
      ...action,
      arguments: normalizeModelToolArguments(action.arguments),
    }));

    const toolByActionId = new Map<string, ReturnType<AssistantToolRegistry['get']>>();
    for (const action of normalizedActions) {
      const tool = this.dependencies.toolRegistry.get(action.tool);
      toolByActionId.set(action.id, tool);
      this.dependencies.permissionGuard.assertCapabilities(
        effectiveCapabilities,
        tool.requiredCapabilities,
        tool.capabilityMatchMode,
      );
    }
    const writeActionsCount = normalizedActions.reduce((count, action) => {
      const tool = toolByActionId.get(action.id);
      return count + (tool?.operationType === 'write' ? 1 : 0);
    }, 0);
    if (writeActionsCount > 1) {
      throw new ApplicationError({
        message: 'Only one write action is allowed per assistant message',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }

    const pendingActions = [];
    for (const action of normalizedActions) {
      const tool = toolByActionId.get(action.id);
      if (!tool || !tool.requiresConfirmation) {
        continue;
      }

      const normalizedPayload = await this.dependencies.actionExecutor.validateWriteActionDraft({
        toolName: tool.name,
        payload: action.arguments,
        context: {
          scope: principal.scope,
          tenantId: principal.tenantId,
        },
      });

      const pendingAction = await this.dependencies.confirmationService.createPendingAction({
        conversationId: input.conversationId,
        tenantId: principal.tenantId,
        userId: principal.userId,
        toolName: tool.name,
        payload: normalizedPayload,
      });
      pendingActions.push(pendingAction);
      await this.dependencies.auditService.recordEvent({
        tenantId: principal.tenantId,
        userId: principal.userId,
        conversationId: input.conversationId,
        actionId: pendingAction.actionId,
        eventType: 'assistant.confirmation.created',
        status: 'success',
        details: {
          tool: tool.name,
        },
      });
    }

    const executions = await this.dependencies.actionExecutor.executeReadActions(normalizedActions, toolByActionId, {
      scope: principal.scope,
      tenantId: principal.tenantId,
    });
    const result: AssistantMessageResult =
      pendingActions.length > 0
        ? {
            type: 'confirmation',
            text:
              llmCompletion.reply ||
              'Draft actions are prepared. Review and confirm before execution.',
            pendingActions,
          }
        : {
            type: 'text',
            text: composeReadReply(llmCompletion.reply, executions, normalizedActions),
            plannedActions: normalizedActions.length,
            executions,
          };

    const assistantMessage = await this.dependencies.conversationService.appendMessage({
      conversationId: input.conversationId,
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: 'assistant',
      text: result.text,
      resultType: result.type,
      metadata: {
        actions: actions.map((action) => ({
          id: action.id,
          tool: action.tool,
          dependsOn: action.dependsOn,
        })),
      },
    });
    await this.dependencies.conversationService.markConversationStatus({
      conversationId: input.conversationId,
      tenantId: principal.tenantId,
      userId: principal.userId,
      status: pendingActions.length > 0 ? 'pending_confirmation' : 'active',
    });

    await this.dependencies.auditService.recordEvent({
      tenantId: principal.tenantId,
      userId: principal.userId,
      conversationId: input.conversationId,
      messageId: assistantMessage.id,
      eventType: 'assistant.message.responded',
      status: 'success',
      details: {
        plannedActions: actions.length,
        confirmationRequired: pendingActions.length > 0,
      },
    });

    return {
      conversationId: input.conversationId,
      messageId: assistantMessage.id,
      result,
    };
  }

  private async completePlan(
    content: string,
    history: AssistantLlmCompletionRequest['history'],
  ): Promise<AssistantLlmCompletionResult> {
    const request: AssistantLlmCompletionRequest = {
      userMessage: content,
      history,
      systemPrompt: buildSystemPrompt(new Date()),
      tools: this.dependencies.toolRegistry.list(),
      languageHint: detectLanguageHint(content),
    };

    try {
      return await this.dependencies.provider.completePlan(request);
    } catch (error) {
      const hasHistory = (history?.length ?? 0) > 0;

      if (isStructuredOutputError(error)) {
        try {
          return await this.dependencies.provider.completePlan({
            ...request,
            userMessage: `${content}\n\nReturn valid strict JSON only. No prose outside JSON.`,
          });
        } catch (retryError) {
          if (hasHistory && shouldRetryWithoutHistory(retryError)) {
            return this.completePlanWithoutHistory(content, request.systemPrompt, request.tools);
          }
          throw retryError;
        }
      }

      if (hasHistory && shouldRetryWithoutHistory(error)) {
        return this.completePlanWithoutHistory(content, request.systemPrompt, request.tools);
      }
      throw error;
    }
  }

  private async completePlanWithFallback(
    content: string,
    history: AssistantLlmCompletionRequest['history'],
  ): Promise<AssistantLlmCompletionResult> {
    try {
      return await this.completePlan(content, history);
    } catch (error) {
      const fallbackActions = buildCatalogFallbackActions(content);
      if (fallbackActions.length > 0 && isRateLimitError(error)) {
        return {
          reply:
            'The assistant is currently busy, so I fetched the catalog data directly.',
          actions: fallbackActions,
        };
      }
      throw error;
    }
  }

  private async completePlanWithoutHistory(
    content: string,
    systemPrompt: string,
    tools: AssistantLlmCompletionRequest['tools'],
  ): Promise<AssistantLlmCompletionResult> {
    const requestWithoutHistory: AssistantLlmCompletionRequest = {
      userMessage: content,
      history: [],
      systemPrompt,
      tools,
      languageHint: detectLanguageHint(content),
    };

    try {
      return await this.dependencies.provider.completePlan(requestWithoutHistory);
    } catch (error) {
      if (!isStructuredOutputError(error)) {
        throw error;
      }

      return this.dependencies.provider.completePlan({
        ...requestWithoutHistory,
        userMessage: `${content}\n\nReturn valid strict JSON only. No prose outside JSON.`,
      });
    }
  }

  public async confirmAction(
    principal: AssistantPrincipalContext,
    input: {
      actionId: string;
      confirmationToken: string;
    },
  ): Promise<{
    actionId: string;
    conversationId: string;
    status: 'confirmed';
    message: string;
  }> {
    const confirmedAction = await this.dependencies.confirmationService.confirmPendingAction({
      actionId: input.actionId,
      tenantId: principal.tenantId,
      userId: principal.userId,
      confirmationToken: input.confirmationToken,
    });

    if (
      !this.dependencies.createToolsEnabled &&
      confirmedAction.toolName.startsWith('create_')
    ) {
      throw new ApplicationError({
        message: 'Assistant create tools are disabled',
        statusCode: 403,
        code: APPLICATION_ERROR_CODES.FORBIDDEN,
        expose: true,
      });
    }

    const effectiveCapabilities = new Set(resolveRoleCapabilities(principal.roles));
    const tool = this.dependencies.toolRegistry.get(confirmedAction.toolName);
    try {
      this.dependencies.permissionGuard.assertCapabilities(
        effectiveCapabilities,
        tool.requiredCapabilities,
        tool.capabilityMatchMode,
      );
    } catch (error) {
      await this.dependencies.auditService.recordEvent({
        tenantId: principal.tenantId,
        userId: principal.userId,
        conversationId: confirmedAction.conversationId,
        actionId: confirmedAction.actionId,
        eventType: 'assistant.permission.denied',
        status: 'denied',
        details: {
          tool: confirmedAction.toolName,
          stage: 'confirm',
        },
      });
      await this.dependencies.confirmationService.releasePendingAction({
        actionId: confirmedAction.actionId,
        tenantId: principal.tenantId,
        userId: principal.userId,
      });
      throw error;
    }

    let execution: Awaited<ReturnType<AssistantActionExecutor['executeConfirmedWriteAction']>>;
    try {
      execution = await this.dependencies.actionExecutor.executeConfirmedWriteAction({
        actionId: confirmedAction.actionId,
        toolName: confirmedAction.toolName,
        payload: confirmedAction.payload,
        context: {
          scope: principal.scope,
          tenantId: principal.tenantId,
        },
      });
    } catch (error) {
      await this.dependencies.confirmationService.releasePendingAction({
        actionId: confirmedAction.actionId,
        tenantId: principal.tenantId,
        userId: principal.userId,
      });
      await this.dependencies.auditService.recordEvent({
        tenantId: principal.tenantId,
        userId: principal.userId,
        conversationId: confirmedAction.conversationId,
        actionId: confirmedAction.actionId,
        eventType: 'assistant.confirmation.accepted',
        status: 'failed',
        details: {
          tool: confirmedAction.toolName,
          stage: 'execution',
        },
      });
      throw error;
    }
    await this.dependencies.confirmationService.completePendingAction({
      actionId: confirmedAction.actionId,
      tenantId: principal.tenantId,
      userId: principal.userId,
    });
    await this.dependencies.auditService.recordEvent({
      tenantId: principal.tenantId,
      userId: principal.userId,
      conversationId: confirmedAction.conversationId,
      actionId: confirmedAction.actionId,
      eventType: 'assistant.confirmation.accepted',
      status: 'success',
      details: {
        tool: confirmedAction.toolName,
      },
    });

    const confirmationText = buildWriteConfirmationText(execution);

    await this.dependencies.conversationService.appendMessage({
      conversationId: confirmedAction.conversationId,
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: 'assistant',
      text: confirmationText,
      resultType: 'confirmation',
      metadata: {
        actionId: execution.actionId,
        tool: execution.tool,
        status: execution.status,
        executionId: randomUUID(),
      },
    });

    await this.dependencies.conversationService.markConversationStatus({
      conversationId: confirmedAction.conversationId,
      tenantId: principal.tenantId,
      userId: principal.userId,
      status: 'active',
    });

    return {
      actionId: confirmedAction.actionId,
      conversationId: confirmedAction.conversationId,
      status: 'confirmed',
      message: confirmationText,
    };
  }
}

class DeterministicTestProvider implements AssistantLlmProvider {
  public readonly name = 'mock' as const;

  public constructor(private readonly reply: AssistantLlmCompletionResult) {}

  public completePlan(): Promise<AssistantLlmCompletionResult> {
    return Promise.resolve(this.reply);
  }
}

class NoopOrdersServiceForTests {
  public listOrders(): Promise<{ items: unknown[]; meta: unknown }> {
    return Promise.resolve({
      items: [
        { id: '66f100000000000000000901', orderNumber: 'ord-1' },
        { id: '66f100000000000000000902', orderNumber: 'ord-2' },
      ],
      meta: { totalItems: 2, page: 1, pageSize: 20, totalPages: 1 },
    });
  }

  public getOrderById(): Promise<Record<string, never>> {
    return Promise.resolve({});
  }

  public createOrder(payload: unknown): Promise<unknown> {
    return Promise.resolve(payload);
  }

  public updateOrder(_orderId: string, payload: unknown): Promise<unknown> {
    return Promise.resolve(payload);
  }
}

class NoopPatientsServiceForTests {
  private readonly patient = {
    id: '96889346eeb97e3c70caa914',
    name: 'Adam Wael',
    doctorId: '66f100000000000000000222',
    clinicId: '66f100000000000000000333',
  };

  public listPatients(): Promise<{ items: unknown[]; meta: unknown }> {
    return Promise.resolve({
      items: [this.patient],
      meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 },
    });
  }

  public getPatientById(patientId: string): Promise<unknown> {
    if (patientId === this.patient.id) {
      return Promise.resolve(this.patient);
    }
    return Promise.resolve({});
  }
}

class NoopDoctorsServiceForTests {
  private readonly doctor = {
    id: '66f100000000000000000222',
    name: 'Mostafa Samir',
    clinicId: '66f100000000000000000333',
  };

  public listDoctors(): Promise<{ items: unknown[]; meta: unknown }> {
    return Promise.resolve({
      items: [this.doctor],
      meta: { totalItems: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
  }

  public getDoctorById(doctorId: string): Promise<unknown> {
    if (doctorId === this.doctor.id) {
      return Promise.resolve(this.doctor);
    }
    return Promise.resolve({});
  }
}

class NoopClinicsServiceForTests {
  private readonly clinic = {
    id: '66f100000000000000000333',
    name: 'Dental Care Clinic 10',
  };

  public listClinics(): Promise<{ items: unknown[]; meta: unknown }> {
    return Promise.resolve({
      items: [this.clinic],
      meta: { totalItems: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
  }

  public getClinicById(clinicId: string): Promise<unknown> {
    if (clinicId === this.clinic.id) {
      return Promise.resolve(this.clinic);
    }
    return Promise.resolve({});
  }
}

function normalizeModelToolArguments(value: Record<string, unknown>): Record<string, unknown> {
  if (!('dependsOn' in value)) {
    return value;
  }

  const normalized = { ...value };
  delete normalized.dependsOn;
  return normalized;
}

function composeReadReply(
  reply: string,
  executions: Parameters<typeof formatExecutionsAsMarkdown>[0],
  actions: AssistantPlanAction[],
): string {
  const data = formatExecutionsAsMarkdown(executions);
  const intro = reply.trim();
  if (data.length === 0) {
    return intro || buildReadOnlyFallbackText(actions);
  }

  return intro ? `${intro}\n\n${data}` : data;
}

function buildReadOnlyFallbackText(actions: AssistantPlanAction[]): string {
  if (actions.length === 0) {
    return 'No executable actions were planned for this message.';
  }

  return `Planned ${actions.length} action(s): ${actions.map((action) => action.tool).join(', ')}.`;
}

function buildCatalogFallbackActions(content: string): AssistantPlanAction[] {
  const normalized = content.toLowerCase();
  const isOperationalWritePrompt =
    /(create|update|change|add|edit|new)\s+(order|patient|doctor|clinic|workflow|scan)/u.test(normalized) ||
    /(انشاء|إنشاء|تحديث|تعديل|اضافة|إضافة|طلب|مريض|دكتور|عيادة)/u.test(normalized);
  const asksServicePricing =
    /(pricing|prices?|price list|cost|fees?|الاسعار|الأسعار|السعر)/u.test(
      normalized,
    );
  const asksServiceCatalog =
    /(services?|service catalog|catalog|offerings|الخدمات|الخدمه|الخدمة)/u.test(normalized);
  const asksCompanyProfile =
    !isOperationalWritePrompt &&
    /(about|company|profile|contact|working hours|address|who are you|about us|من نحن|الشركة|الملف|العنوان|التواصل|ساعات العمل)/u.test(
      normalized,
    );
  const asksSubmissionStandards =
    /(submission standard|submission standards|requirements|المتطلبات|معايير|ستاندرد|standard)/u.test(
      normalized,
    );

  const actions: AssistantPlanAction[] = [];
  if (asksCompanyProfile) {
    actions.push({
      id: 'fallback-company-info',
      tool: 'get_company_info',
      arguments: {},
      dependsOn: [],
    });
  }
  if (asksServiceCatalog) {
    actions.push({
      id: 'fallback-list-services',
      tool: 'list_services',
      arguments: {},
      dependsOn: [],
    });
  }
  if (asksServicePricing) {
    actions.push({
      id: 'fallback-list-service-prices',
      tool: 'list_service_prices',
      arguments: {},
      dependsOn: [],
    });
  }
  if (asksSubmissionStandards) {
    actions.push({
      id: 'fallback-submission-standards',
      tool: 'get_submission_standards',
      arguments: {},
      dependsOn: [],
    });
  }

  return actions;
}

function detectLanguageHint(content: string): 'ar' | 'en' | 'mixed' {
  const hasArabic = /[\u0600-\u06FF]/u.test(content);
  const hasEnglish = /[A-Za-z]/u.test(content);
  if (hasArabic && hasEnglish) {
    return 'mixed';
  }

  return hasArabic ? 'ar' : 'en';
}

const HISTORY_MAX_MESSAGES = 10;
const HISTORY_MAX_CHARS = 1_200;

function buildHistory(
  messages: ReadonlyArray<{ role: 'user' | 'assistant'; text: string }>,
): NonNullable<AssistantLlmCompletionRequest['history']> {
  return messages.slice(-HISTORY_MAX_MESSAGES).map((message) => ({
    role: message.role,
    content: message.text.slice(0, HISTORY_MAX_CHARS),
  }));
}

function buildSystemPrompt(now: Date): string {
  return [
    `Current date/time (UTC): ${now.toISOString()}. Resolve relative dates such as "today", "tomorrow" or "next week" from it.`,
    'You can see the previous messages of this conversation. Use them to complete a request across several turns.',
    'NEVER guess ids, order numbers or required fields. If a required field is missing, ask the user for it in "reply" and return an empty actions array.',
    'To turn a name into an id, you may call search tools, or pass patientName/doctorName/clinicName in create_order and let backend resolve them.',
    'You are the Dental SaaS assistant for a dental laboratory platform.',
    'Reply in the same language the user writes in (Arabic, English or mixed).',
    'Never execute delete operations.',
    'Respect authenticated user capabilities and tenant scope.',
    'NEVER invent company facts, services, prices, orders, patients, doctors or clinics. All of them come from tools.',
    'For questions about the company, call get_company_info.',
    'For service catalog details, call list_services.',
    'For service pricing only, call list_service_prices.',
    'For submission standards only, call get_submission_standards.',
    'All authenticated users can call list_services, list_service_prices, get_submission_standards and get_company_info.',
    'For orders, patients, doctors or clinics, call the matching search/details tool.',
    'When creating a patient, you may pass clinicName/doctorName if ids are unavailable; the system resolves exact existing matches only and returns validation errors for missing or ambiguous matches.',
    'The system appends the tool results to your reply automatically, so keep "reply" to one short sentence and do not repeat or retype the data.',
    'If the request needs no tool (greeting, general help), answer briefly in "reply" with an empty actions array.',
    'Return strict JSON object: {"reply":string,"actions":[{"id":string,"tool":string,"arguments":object,"dependsOn":string[]}]}',
    'Do not include chain of thought.',
  ].join('\n');
}

function buildWriteConfirmationText(
  execution: AssistantActionExecutionSummary,
): string {
  if (execution.tool === 'create_patient') {
    const result = execution.result as
      | {
          patient?: { id?: string; name?: string };
          provisioning?: {
            createdDoctor?: { id: string; name: string };
            createdClinic?: { id: string; name: string };
          };
        }
      | undefined;
    const lines = ['✅ Patient has been created successfully.'];
    if (result?.patient?.name) {
      lines.push(`- **Patient:** ${result.patient.name}`);
    }
    if (result?.patient?.id) {
      lines.push(`- **Patient ID:** \`${result.patient.id}\``);
    }
    if (result?.provisioning?.createdClinic) {
      lines.push(
        `- **New clinic created:** ${result.provisioning.createdClinic.name} (\`${result.provisioning.createdClinic.id}\`)`,
      );
    }
    if (result?.provisioning?.createdDoctor) {
      lines.push(
        `- **New doctor created:** ${result.provisioning.createdDoctor.name} (\`${result.provisioning.createdDoctor.id}\`)`,
      );
    }
    return lines.join('\n');
  }

  return `Action confirmed and executed: ${execution.tool}.`;
}

export function isStructuredOutputError(error: unknown): boolean {
  return (
    error instanceof ApplicationError &&
    /valid JSON object|structured assistant completion payload|did not return assistant content/i.test(
      error.message,
    )
  );
}

function shouldRetryWithoutHistory(error: unknown): boolean {
  return (
    error instanceof ApplicationError &&
    (error.statusCode === 400 ||
      error.statusCode === 413 ||
      error.statusCode === 429 ||
      error.statusCode === 502)
  );
}

export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof ApplicationError)) {
    return false;
  }

  const upstreamStatus = Number(error.details?.status);
  return error.statusCode === 429 || upstreamStatus === 429;
}

function toConversationView(record: {
  conversationId: string;
  title: string;
  status: 'active' | 'pending_confirmation';
  createdAt: Date;
  updatedAt: Date;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    text: string;
    resultType: string;
    createdAt: Date;
    metadata?: Record<string, unknown>;
  }>;
}): AssistantConversationView {
  return {
    id: record.conversationId,
    title: record.title,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    messages: record.messages.map((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}
