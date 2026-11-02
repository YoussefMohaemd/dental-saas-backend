import { type AssistantPlanAction, type AssistantToolDefinition } from '../domain/assistant.types';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';

export interface AssistantActionExecutionSummary {
  actionId: string;
  tool: string;
  status: 'executed';
}

export class AssistantActionExecutor {
  public executeReadActions(
    actions: AssistantPlanAction[],
    toolByActionId: Map<string, AssistantToolDefinition>,
  ): AssistantActionExecutionSummary[] {
    return actions
      .filter((action) => {
        const tool = toolByActionId.get(action.id);
        return tool?.operationType === 'read';
      })
      .map((action) => ({
        actionId: action.id,
        tool: action.tool,
        status: 'executed' as const,
      }));
  }

  public executeConfirmedWriteAction(input: {
    actionId: string;
    toolName: string;
    payload: Record<string, unknown>;
  }): AssistantActionExecutionSummary {
    if (containsDeleteOperation(input.toolName)) {
      throw new ApplicationError({
        message: 'Delete operations are blocked',
        statusCode: 403,
        code: APPLICATION_ERROR_CODES.FORBIDDEN,
        expose: true,
        details: { tool: input.toolName },
      });
    }

    return {
      actionId: input.actionId,
      tool: input.toolName,
      status: 'executed',
    };
  }
}

function containsDeleteOperation(toolName: string): boolean {
  return /delete|remove|truncate|drop/i.test(toolName);
}
