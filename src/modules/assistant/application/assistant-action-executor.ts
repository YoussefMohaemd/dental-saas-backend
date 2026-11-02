import { type AssistantPlanAction, type AssistantToolDefinition } from '../domain/assistant.types';

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
}

