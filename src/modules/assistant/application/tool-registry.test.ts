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

  it('documents multilingual person-name order searches', () => {
    const searchOrders = buildAssistantToolRegistry().get('search_orders');

    expect(searchOrders.description).toContain('patient');
    expect(searchOrders.argumentsHint).toContain('Arabic');
    expect(searchOrders.argumentsHint).toContain('common transliteration');
  });

  it('documents direct order detail lookup by a unique patient name', () => {
    const getOrderDetails = buildAssistantToolRegistry().get('get_order_details');

    expect(getOrderDetails.description).toContain('patient name');
    expect(getOrderDetails.description).toContain('unique order');
    expect(getOrderDetails.argumentsHint).toContain('order number');
  });

  it('omits create tools when create tools are disabled', () => {
    const registry = buildAssistantToolRegistry({ createToolsEnabled: false });

    expect(registry.list().some((tool) => tool.name === 'create_order')).toBe(false);
    expect(registry.list().some((tool) => tool.name === 'create_patient')).toBe(false);
    expect(() => registry.get('create_order')).toThrow('Unknown assistant tool');
  });

  it('exposes schemas for bilingual entity and service resolution', () => {
    const registry = buildAssistantToolRegistry();

    expect(registry.get('create_order').parameters).toEqual(
      expect.objectContaining({
        type: 'object',
        properties: expect.objectContaining({
          payload: expect.objectContaining({
            type: 'object',
          }),
        }),
      }),
    );
    expect(registry.get('update_patient').parameters).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          patientId: expect.objectContaining({ type: 'string' }),
          patientName: expect.objectContaining({ type: 'string' }),
        }),
      }),
    );
  });
});
