import { describe, expect, it } from 'vitest';

import { buildAssistantToolRegistry } from './tool-registry';

describe('buildAssistantToolRegistry', () => {
  it('does not expose any delete tool', () => {
    const registry = buildAssistantToolRegistry();

    const deleteTool = registry.list().find((tool) => tool.operationType === 'delete');
    expect(deleteTool).toBeUndefined();
  });

  it('resolves known tools and rejects unknown tools', () => {
    const registry = buildAssistantToolRegistry();

    const searchOrders = registry.get('search_orders');
    expect(searchOrders.name).toBe('search_orders');

    expect(() => registry.get('delete_order')).toThrow('Unknown assistant tool');
  });

  it('omits create tools when create tools are disabled', () => {
    const registry = buildAssistantToolRegistry({ createToolsEnabled: false });

    expect(registry.list().some((tool) => tool.name === 'create_order')).toBe(false);
    expect(registry.list().some((tool) => tool.name === 'create_patient')).toBe(false);
    expect(() => registry.get('create_order')).toThrow('Unknown assistant tool');
  });
});
