import { describe, expect, it } from 'vitest';

import { ActionPlanner } from './action-planner';

describe('ActionPlanner', () => {
  it('rejects cyclic dependencies', () => {
    const planner = new ActionPlanner({ maxActionsPerMessage: 5, maxPlanningRounds: 3 });

    expect(() =>
      planner.validatePlan({
        intent: 'multiple_actions',
        actions: [
          {
            id: 'a',
            tool: 'search_orders',
            arguments: {},
            dependsOn: ['b'],
          },
          {
            id: 'b',
            tool: 'get_order_details',
            arguments: {},
            dependsOn: ['a'],
          },
        ],
      }),
    ).toThrow('Cyclic dependencies are not allowed');
  });

  it('rejects delete operations from model output', () => {
    const planner = new ActionPlanner({ maxActionsPerMessage: 5, maxPlanningRounds: 3 });

    expect(() =>
      planner.validatePlan({
        intent: 'single_action',
        actions: [
          {
            id: 'a',
            tool: 'delete_order',
            arguments: {},
            dependsOn: [],
          },
        ],
      }),
    ).toThrow('Delete operations are blocked');
  });
});
