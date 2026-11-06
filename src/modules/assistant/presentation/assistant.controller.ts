import { type Request, type Response } from 'express';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { sendCreated, sendOk } from '../../../shared/presentation/http/api-response';
import { getAuthenticatedDataScope } from '../../../shared/presentation/http/http-utils';
import { ensureObjectId } from '../../../shared/presentation/http/http-utils';
import { type RequestWithContext } from '../../../shared/presentation/http/request-context';
import { type AssistantService } from '../application/assistant-service';
import {
  assistantActionIdParamSchema,
  assistantConfirmBodySchema,
  assistantConversationIdParamSchema,
  assistantCreateConversationBodySchema,
  assistantListConversationsQuerySchema,
  assistantMessageBodySchema,
} from './assistant.schemas';

export class AssistantController {
  public constructor(private readonly assistantService: AssistantService) {}

  public getSuggestions = async (req: Request, res: Response): Promise<void> => {
    const principal = await readPrincipal(req);
    const suggestions = await this.assistantService.getSuggestions(principal);
    sendOk(res, suggestions, buildRequestMeta(req));
  };

  public listConversations = async (req: Request, res: Response): Promise<void> => {
    const principal = await readPrincipal(req);
    const query = assistantListConversationsQuerySchema.parse(req.query);
    const conversations = await this.assistantService.listConversations(principal, {
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    sendOk(res, conversations, buildRequestMeta(req));
  };

  public createConversation = async (req: Request, res: Response): Promise<void> => {
    const principal = await readPrincipal(req);
    const payload = assistantCreateConversationBodySchema.parse(req.body);
    const conversation = await this.assistantService.createConversation({
      ...principal,
      ...(payload.title ? { title: payload.title } : {}),
    });

    sendCreated(res, conversation, buildRequestMeta(req));
  };

  public getConversation = async (req: Request, res: Response): Promise<void> => {
    const principal = await readPrincipal(req);
    const { conversationId } = assistantConversationIdParamSchema.parse(req.params);
    const conversation = await this.assistantService.getConversation(principal, conversationId);
    sendOk(res, conversation, buildRequestMeta(req));
  };

  public postMessage = async (req: Request, res: Response): Promise<void> => {
    const principal = await readPrincipal(req);
    const { conversationId } = assistantConversationIdParamSchema.parse(req.params);
    const payload = assistantMessageBodySchema.parse(req.body);
    const result = await this.assistantService.postMessage(principal, {
      conversationId,
      content: payload.content,
    });
    sendOk(res, result, buildRequestMeta(req));
  };

  public confirmAction = async (req: Request, res: Response): Promise<void> => {
    const principal = await readPrincipal(req);
    const { actionId } = assistantActionIdParamSchema.parse(req.params);
    const payload = assistantConfirmBodySchema.parse(req.body);
    const result = await this.assistantService.confirmAction(principal, {
      actionId,
      confirmationToken: payload.confirmationToken,
    });
    sendOk(res, result, buildRequestMeta(req));
  };
}

async function readPrincipal(req: Request): Promise<{
  tenantId: string;
  userId: string;
  roles: string[];
  scope: Awaited<ReturnType<typeof getAuthenticatedDataScope>>;
}> {
  const requestWithContext = req as RequestWithContext;
  const principal = requestWithContext.context?.principal;
  if (!principal) {
    throw new ApplicationError({
      message: 'Authentication is required',
      statusCode: 401,
      code: APPLICATION_ERROR_CODES.UNAUTHORIZED,
      expose: true,
    });
  }

  const tenantId = ensureObjectId(principal.tenantId, 'tenantId').toHexString();
  const userId = ensureObjectId(principal.userId, 'userId').toHexString();
  const scope = await getAuthenticatedDataScope(req);
  return {
    tenantId,
    userId,
    roles: principal.roles,
    scope,
  };
}

function buildRequestMeta(req: Request): { requestId?: string } | undefined {
  const requestWithContext = req as RequestWithContext;
  return requestWithContext.context.requestId
    ? { requestId: requestWithContext.context.requestId }
    : undefined;
}
