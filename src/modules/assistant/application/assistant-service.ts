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
import { type AssistantLlmCompletionResult, type AssistantLlmProvider } from './llm-provider';
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
  }>;
}

export type AssistantMessageResult = AssistantMessageResultText | AssistantMessageResultConfirmation;

export class AssistantService {
  public constructor(private readonly dependencies: AssistantServiceDependencies) {}

  public static createForTests(params?: {
    providerReply?: AssistantLlmCompletionResult;
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
      doctorService: {} as unknown as DoctorService,
      clinicService: {} as unknown as ClinicService,
      options: {
        maxActionsPerMessage: 8,
        maxPlanningRounds: 4,
        maxInputChars: 4_000,
        confirmationTtlSeconds: 900,
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
  }): AssistantService {
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
      toolRegistry: buildAssistantToolRegistry(),
      promptCatalogService,
      permissionGuard,
      actionPlanner,
      actionExecutor,
      conversationService,
      confirmationService,
      auditService,
      options: params.options,
    });
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

    await this.dependencies.conversationService.getOwnedConversation({
      conversationId: input.conversationId,
      tenantId: principal.tenantId,
      userId: principal.userId,
    });

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
    const llmCompletion = await this.completePlanWithFallback(content);

    const plannedActions = applyCatalogFallbackActions(content, llmCompletion.actions);
    const actions = this.dependencies.actionPlanner.validatePlan({
      intent: plannedActions.length > 1 ? 'multiple_actions' : 'single_action',
      actions: plannedActions,
    }).actions;

    const pendingActions = [];
    const toolByActionId = new Map<string, ReturnType<AssistantToolRegistry['get']>>();
    for (const action of actions) {
      const tool = this.dependencies.toolRegistry.get(action.tool);
      toolByActionId.set(action.id, tool);
      this.dependencies.permissionGuard.assertCapabilities(
        effectiveCapabilities,
        tool.requiredCapabilities,
        tool.capabilityMatchMode,
      );

      if (tool.requiresConfirmation) {
        const pendingAction = await this.dependencies.confirmationService.createPendingAction({
          conversationId: input.conversationId,
          tenantId: principal.tenantId,
          userId: principal.userId,
          toolName: tool.name,
          payload: action.arguments,
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

    }

    const executions = await this.dependencies.actionExecutor.executeReadActions(actions, toolByActionId, {
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
            text: composeReadReply(llmCompletion.reply, executions, actions),
            plannedActions: actions.length,
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

  private async completePlanWithFallback(
    content: string,
  ): Promise<AssistantLlmCompletionResult> {
    try {
      return await this.dependencies.provider.completePlan({
        userMessage: content,
        systemPrompt: buildSystemPrompt(),
        tools: this.dependencies.toolRegistry.list(),
        languageHint: detectLanguageHint(content),
      });
    } catch (error) {
      if (!isAssistantTimeoutError(error)) {
        throw error;
      }

      const fallbackActions = buildTimeoutFallbackActions(content);
      if (fallbackActions.length === 0) {
        throw error;
      }

      return {
        reply: 'Model timed out, so I used direct data tools.',
        actions: fallbackActions,
      };
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
      throw error;
    }

    const execution = await this.dependencies.actionExecutor.executeConfirmedWriteAction({
      actionId: confirmedAction.actionId,
      toolName: confirmedAction.toolName,
      payload: confirmedAction.payload,
      context: {
        scope: principal.scope,
        tenantId: principal.tenantId,
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
      items: [],
      meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 },
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
  public listPatients(): Promise<{ items: unknown[]; meta: unknown }> {
    return Promise.resolve({
      items: [],
      meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 },
    });
  }

  public getPatientById(): Promise<Record<string, never>> {
    return Promise.resolve({});
  }
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

function detectLanguageHint(content: string): 'ar' | 'en' | 'mixed' {
  const hasArabic = /[\u0600-\u06FF]/u.test(content);
  const hasEnglish = /[A-Za-z]/u.test(content);
  if (hasArabic && hasEnglish) {
    return 'mixed';
  }

  return hasArabic ? 'ar' : 'en';
}

function buildSystemPrompt(): string {
  return [
    'You are the Dental SaaS assistant for a dental laboratory platform.',
    'Reply in the same language the user writes in (Arabic, English or mixed).',
    'Never execute delete operations.',
    'Respect authenticated user capabilities and tenant scope.',
    'NEVER invent company facts, services, prices, orders, patients, doctors or clinics. All of them come from tools.',
    'For questions about the company, call get_company_info. For services or prices, call list_services.',
    'All authenticated users can call list_services and get_company_info.',
    'For orders, patients, doctors or clinics, call the matching search/details tool.',
    'When creating a patient, you may pass clinicName/doctorName if ids are unavailable; the system can auto-resolve or create missing clinic/doctor with safe defaults.',
    'The system appends the tool results to your reply automatically, so keep "reply" to one short sentence and do not repeat or retype the data.',
    'If the request needs no tool (greeting, general help), answer briefly in "reply" with an empty actions array.',
    'Return strict JSON object: {"reply":string,"actions":[{"id":string,"tool":string,"arguments":object,"dependsOn":string[]}]}',
    'Do not include chain of thought.',
  ].join('\n');
}

function applyCatalogFallbackActions(
  content: string,
  actions: AssistantPlanAction[],
): AssistantPlanAction[] {
  if (actions.some((action) => action.tool === 'list_services')) {
    return actions;
  }

  if (!isServiceCatalogQuery(content)) {
    return actions;
  }

  return [
    ...actions,
    {
      id: 'auto-list-services',
      tool: 'list_services',
      arguments: {},
      dependsOn: [],
    },
  ];
}

function isServiceCatalogQuery(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes('service') ||
    normalized.includes('services') ||
    normalized.includes('price') ||
    normalized.includes('pricing') ||
    /[\u0600-\u06FF]/u.test(content) &&
      (content.includes('خدم') || content.includes('سعر'))
  );
}

function isAssistantTimeoutError(error: unknown): boolean {
  return (
    error instanceof ApplicationError &&
    error.statusCode === 504 &&
    error.message.toLowerCase().includes('timed out')
  );
}

function buildTimeoutFallbackActions(content: string): AssistantPlanAction[] {
  const orderCode = content.match(/[A-Z]{2,}-\d{3,}/i)?.[0];
  if (orderCode && isOrderDetailsQuery(content)) {
    return [
      {
        id: 'fallback-order-details',
        tool: 'get_order_details',
        arguments: { orderId: orderCode },
        dependsOn: [],
      },
    ];
  }

  const doctorName = extractDoctorName(content);
  if (doctorName) {
    return [
      {
        id: 'fallback-search-orders-doctor',
        tool: 'search_orders',
        arguments: { search: doctorName },
        dependsOn: [],
      },
    ];
  }

  if (orderCode) {
    return [
      {
        id: 'fallback-search-orders-code',
        tool: 'search_orders',
        arguments: { search: orderCode },
        dependsOn: [],
      },
    ];
  }

  if (isServiceCatalogQuery(content)) {
    return [
      {
        id: 'fallback-list-services',
        tool: 'list_services',
        arguments: {},
        dependsOn: [],
      },
    ];
  }

  return [];
}

function isOrderDetailsQuery(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes('show data') ||
    normalized.includes('order details') ||
    normalized.includes('details for order') ||
    content.includes('بيانات') ||
    content.includes('تفاصيل')
  );
}

function extractDoctorName(content: string): string | null {
  const latinDoctor = content.match(/(?:doctor|dr\.?|دكتور)\s+([A-Za-z][A-Za-z\s'-]{1,80})/i)?.[1];
  if (latinDoctor) {
    return latinDoctor.trim();
  }

  return null;
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
