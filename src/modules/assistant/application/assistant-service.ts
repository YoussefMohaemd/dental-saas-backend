import { randomUUID } from 'node:crypto';

import { resolveRoleCapabilities } from '../../auth/application/authorization-policy';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { ActionPlanner } from './action-planner';
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
    const actionExecutor = new AssistantActionExecutor();
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
    const llmCompletion = await this.dependencies.provider.completePlan({
      userMessage: content,
      systemPrompt: buildSystemPrompt(),
      tools: this.dependencies.toolRegistry.list(),
      languageHint: detectLanguageHint(content),
    });

    const actions = this.dependencies.actionPlanner.validatePlan({
      intent: llmCompletion.actions.length > 1 ? 'multiple_actions' : 'single_action',
      actions: llmCompletion.actions,
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

    const executions = this.dependencies.actionExecutor.executeReadActions(actions, toolByActionId);
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
            text:
              llmCompletion.reply ||
              buildReadOnlyFallbackText(actions),
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

    const execution = this.dependencies.actionExecutor.executeConfirmedWriteAction({
      actionId: confirmedAction.actionId,
      toolName: confirmedAction.toolName,
      payload: confirmedAction.payload,
    });

    await this.dependencies.conversationService.appendMessage({
      conversationId: confirmedAction.conversationId,
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: 'assistant',
      text: `Confirmation accepted. Executed write action: ${execution.tool}.`,
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
      message: `Action confirmed and executed: ${execution.tool}.`,
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
    'You are Dental SaaS assistant.',
    'Never execute delete operations.',
    'Respect authenticated user capabilities and tenant scope.',
    'Return strict JSON object: {"reply":string,"actions":[{"id":string,"tool":string,"arguments":object,"dependsOn":string[]}]}',
    'Do not include chain of thought.',
  ].join('\n');
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
