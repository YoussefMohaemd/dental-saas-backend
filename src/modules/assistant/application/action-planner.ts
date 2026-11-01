import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { type AssistantPlan } from '../domain/assistant.types';

interface ActionPlannerOptions {
  maxActionsPerMessage: number;
  maxPlanningRounds: number;
}

export class ActionPlanner {
  public constructor(private readonly options: ActionPlannerOptions) {}

  public validatePlan(plan: AssistantPlan): AssistantPlan {
    if (plan.actions.length > this.options.maxActionsPerMessage) {
      throw new ApplicationError({
        message: 'Assistant plan exceeds allowed action count',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
        details: {
          maxActionsPerMessage: this.options.maxActionsPerMessage,
        },
      });
    }

    const ids = new Set<string>();
    for (const action of plan.actions) {
      if (ids.has(action.id)) {
        throw new ApplicationError({
          message: 'Duplicate action id in assistant plan',
          statusCode: 400,
          code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
          expose: true,
          details: { actionId: action.id },
        });
      }

      ids.add(action.id);
      if (containsDeleteOperation(action.tool)) {
        throw new ApplicationError({
          message: 'Delete operations are blocked',
          statusCode: 403,
          code: APPLICATION_ERROR_CODES.FORBIDDEN,
          expose: true,
          details: { tool: action.tool },
        });
      }
    }

    for (const action of plan.actions) {
      for (const dependency of action.dependsOn) {
        if (!ids.has(dependency)) {
          throw new ApplicationError({
            message: 'Action dependency does not exist',
            statusCode: 400,
            code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
            expose: true,
            details: { actionId: action.id, dependencyId: dependency },
          });
        }

        if (dependency === action.id) {
          throw new ApplicationError({
            message: 'Action cannot depend on itself',
            statusCode: 400,
            code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
            expose: true,
            details: { actionId: action.id },
          });
        }
      }
    }

    ensureNoCycles(plan);
    ensurePlanningDepth(plan, this.options.maxPlanningRounds);
    return plan;
  }
}

function ensureNoCycles(plan: AssistantPlan): void {
  const actionMap = new Map(plan.actions.map((action) => [action.id, action]));
  const visited = new Set<string>();
  const stack = new Set<string>();

  const walk = (actionId: string): void => {
    if (stack.has(actionId)) {
      throw new ApplicationError({
        message: 'Cyclic dependencies are not allowed',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }

    if (visited.has(actionId)) {
      return;
    }

    visited.add(actionId);
    stack.add(actionId);
    const action = actionMap.get(actionId);
    if (!action) {
      stack.delete(actionId);
      return;
    }

    for (const dependencyId of action.dependsOn) {
      walk(dependencyId);
    }

    stack.delete(actionId);
  };

  for (const action of plan.actions) {
    walk(action.id);
  }
}

function ensurePlanningDepth(plan: AssistantPlan, maxPlanningRounds: number): void {
  const actionMap = new Map(plan.actions.map((action) => [action.id, action]));
  const memo = new Map<string, number>();

  const resolveDepth = (actionId: string): number => {
    const cached = memo.get(actionId);
    if (cached !== undefined) {
      return cached;
    }

    const action = actionMap.get(actionId);
    if (!action || action.dependsOn.length === 0) {
      memo.set(actionId, 1);
      return 1;
    }

    const depth = 1 + Math.max(...action.dependsOn.map((dependencyId) => resolveDepth(dependencyId)));
    memo.set(actionId, depth);
    return depth;
  };

  const maxDepth = plan.actions.reduce((currentMax, action) => {
    const depth = resolveDepth(action.id);
    return depth > currentMax ? depth : currentMax;
  }, 0);

  if (maxDepth > maxPlanningRounds) {
    throw new ApplicationError({
      message: 'Assistant plan exceeds maximum planning rounds',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: {
        maxPlanningRounds,
        planDepth: maxDepth,
      },
    });
  }
}

function containsDeleteOperation(toolName: string): boolean {
  return /delete|remove|truncate|drop/i.test(toolName);
}
