import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { type AssistantPendingActionRepository } from './assistant-repositories';

export interface AssistantConfirmationSummary {
  actionId: string;
  tool: string;
  expiresAt: string;
  confirmationToken: string;
  payload: Record<string, unknown>;
}

export class ConfirmationService {
  public constructor(
    private readonly pendingActionRepository: AssistantPendingActionRepository,
    private readonly ttlSeconds: number,
  ) {}

  public async createPendingAction(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    toolName: string;
    payload: Record<string, unknown>;
  }): Promise<AssistantConfirmationSummary> {
    const actionId = randomUUID();
    const confirmationToken = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    await this.pendingActionRepository.create({
      actionId,
      conversationId: params.conversationId,
      tenantId: params.tenantId,
      userId: params.userId,
      toolName: params.toolName,
      payload: params.payload,
      confirmationTokenHash: hashConfirmationToken(confirmationToken),
      expiresAt,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      actionId,
      tool: params.toolName,
      expiresAt: expiresAt.toISOString(),
      confirmationToken,
      payload: params.payload,
    };
  }

  public async confirmPendingAction(params: {
    actionId: string;
    tenantId: string;
    userId: string;
    confirmationToken: string;
  }): Promise<{
    conversationId: string;
    actionId: string;
    toolName: string;
    payload: Record<string, unknown>;
  }> {
    const pendingAction = await this.pendingActionRepository.findOwnedPendingAction({
      actionId: params.actionId,
      tenantId: params.tenantId,
      userId: params.userId,
    });

    if (!pendingAction) {
      throw new ApplicationError({
        message: 'Pending action was not found',
        statusCode: 404,
        code: APPLICATION_ERROR_CODES.NOT_FOUND,
        expose: true,
      });
    }

    if (pendingAction.status === 'confirmed' || pendingAction.consumedAt) {
      throw new ApplicationError({
        message: 'Pending action was already confirmed',
        statusCode: 409,
        code: APPLICATION_ERROR_CODES.CONFLICT,
        expose: true,
      });
    }

    if (pendingAction.status === 'processing') {
      throw new ApplicationError({
        message: 'Pending action is currently being confirmed',
        statusCode: 409,
        code: APPLICATION_ERROR_CODES.CONFLICT,
        expose: true,
      });
    }

    if (pendingAction.expiresAt.getTime() <= Date.now()) {
      throw new ApplicationError({
        message: 'Pending action confirmation expired',
        statusCode: 409,
        code: APPLICATION_ERROR_CODES.CONFLICT,
        expose: true,
      });
    }

    const tokenHash = hashConfirmationToken(params.confirmationToken);
    if (tokenHash !== pendingAction.confirmationTokenHash) {
      throw new ApplicationError({
        message: 'Invalid confirmation token',
        statusCode: 403,
        code: APPLICATION_ERROR_CODES.FORBIDDEN,
        expose: true,
      });
    }

    const claimed = await this.pendingActionRepository.markProcessing({
      actionId: pendingAction.actionId,
      tenantId: pendingAction.tenantId,
      userId: pendingAction.userId,
      updatedAt: new Date(),
    });
    if (!claimed) {
      throw new ApplicationError({
        message: 'Pending action is currently being confirmed',
        statusCode: 409,
        code: APPLICATION_ERROR_CODES.CONFLICT,
        expose: true,
      });
    }

    return {
      actionId: pendingAction.actionId,
      conversationId: pendingAction.conversationId,
      toolName: pendingAction.toolName,
      payload: pendingAction.payload,
    };
  }

  public async completePendingAction(params: {
    actionId: string;
    tenantId: string;
    userId: string;
  }): Promise<void> {
    const marked = await this.pendingActionRepository.markConfirmed({
      actionId: params.actionId,
      tenantId: params.tenantId,
      userId: params.userId,
      consumedAt: new Date(),
    });
    if (!marked) {
      throw new ApplicationError({
        message: 'Pending action confirmation state is invalid',
        statusCode: 409,
        code: APPLICATION_ERROR_CODES.CONFLICT,
        expose: true,
      });
    }
  }

  public async releasePendingAction(params: {
    actionId: string;
    tenantId: string;
    userId: string;
  }): Promise<void> {
    await this.pendingActionRepository.markPending({
      actionId: params.actionId,
      tenantId: params.tenantId,
      userId: params.userId,
      updatedAt: new Date(),
    });
  }
}

function hashConfirmationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
