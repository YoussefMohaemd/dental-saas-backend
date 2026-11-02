import { describe, expect, it } from 'vitest';

import { AssistantService } from './assistant-service';

describe('AssistantService', () => {
  it('filters prompt suggestions by effective capabilities', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'ok',
        actions: [],
      },
    });

    const suggestions = await service.getSuggestions({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      roles: ['manager'],
    });

    expect(suggestions.some((item) => item.id === 'assistant-create-order')).toBe(false);
    expect(suggestions.some((item) => item.id === 'assistant-search-orders')).toBe(true);
  });

  it('returns confirmation result for write actions', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Preparing draft',
        actions: [
          {
            id: 'a1',
            tool: 'create_order',
            arguments: {
              orderNumber: '24580',
            },
            dependsOn: [],
          },
        ],
      },
    });

    const conversation = await service.createConversation({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      roles: ['staff'],
      title: 'Test',
    });

    const response = await service.postMessage(
      {
        tenantId: '66f100000000000000000001',
        userId: '66f1000000000000000000aa',
        roles: ['staff'],
      },
      {
        conversationId: conversation.id,
        content: 'Create a new order for patient X',
      },
    );

    expect(response.result.type).toBe('confirmation');
    if (response.result.type !== 'confirmation') {
      throw new Error('Expected confirmation result');
    }
    expect(response.result.pendingActions).toHaveLength(1);
  });

  it('blocks delete operations even when the model proposes them', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Deleting...',
        actions: [
          {
            id: 'a1',
            tool: 'delete_order',
            arguments: { orderId: '123' },
            dependsOn: [],
          },
        ],
      },
    });

    const conversation = await service.createConversation({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      roles: ['admin'],
      title: 'Delete test',
    });

    await expect(
      service.postMessage(
        {
          tenantId: '66f100000000000000000001',
          userId: '66f1000000000000000000aa',
          roles: ['admin'],
        },
        {
          conversationId: conversation.id,
          content: 'delete this order now',
        },
      ),
    ).rejects.toThrow('Delete operations are blocked');
  });

  it('returns deterministic execution envelope for read actions', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Here is the matching order.',
        actions: [
          {
            id: 'a1',
            tool: 'search_orders',
            arguments: { search: '24580' },
            dependsOn: [],
          },
        ],
      },
    });

    const conversation = await service.createConversation({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      roles: ['staff'],
      title: 'Read execution',
    });

    const response = await service.postMessage(
      {
        tenantId: '66f100000000000000000001',
        userId: '66f1000000000000000000aa',
        roles: ['staff'],
      },
      {
        conversationId: conversation.id,
        content: 'Find order 24580',
      },
    );

    expect(response.result.type).toBe('text');
    if (response.result.type !== 'text') {
      throw new Error('Expected text result');
    }
    expect(response.result.executions).toEqual([
      {
        actionId: 'a1',
        tool: 'search_orders',
        status: 'executed',
      },
    ]);
  });

  it('executes confirmed write actions and blocks replay', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Preparing update',
        actions: [
          {
            id: 'a1',
            tool: 'update_order',
            arguments: { orderId: 'ord-1', status: 'Review' },
            dependsOn: [],
          },
        ],
      },
    });

    const conversation = await service.createConversation({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      roles: ['staff'],
      title: 'Write execution',
    });

    const messageResponse = await service.postMessage(
      {
        tenantId: '66f100000000000000000001',
        userId: '66f1000000000000000000aa',
        roles: ['staff'],
      },
      {
        conversationId: conversation.id,
        content: 'Update order status',
      },
    );

    if (messageResponse.result.type !== 'confirmation') {
      throw new Error('Expected confirmation result');
    }
    const pending = messageResponse.result.pendingActions[0];
    if (!pending) {
      throw new Error('Expected pending action');
    }

    const confirm = await service.confirmAction(
      {
        tenantId: '66f100000000000000000001',
        userId: '66f1000000000000000000aa',
        roles: ['staff'],
      },
      {
        actionId: pending.actionId,
        confirmationToken: pending.confirmationToken,
      },
    );

    expect(confirm.message).toContain('executed');

    await expect(
      service.confirmAction(
        {
          tenantId: '66f100000000000000000001',
          userId: '66f1000000000000000000aa',
          roles: ['staff'],
        },
        {
          actionId: pending.actionId,
          confirmationToken: pending.confirmationToken,
        },
      ),
    ).rejects.toThrow('already confirmed');
  });

  it('re-validates capabilities at confirmation time', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Preparing update',
        actions: [
          {
            id: 'a1',
            tool: 'update_order',
            arguments: { orderId: 'ord-2', status: 'Production' },
            dependsOn: [],
          },
        ],
      },
    });

    const conversation = await service.createConversation({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      roles: ['staff'],
      title: 'Confirm policy',
    });

    const messageResponse = await service.postMessage(
      {
        tenantId: '66f100000000000000000001',
        userId: '66f1000000000000000000aa',
        roles: ['staff'],
      },
      {
        conversationId: conversation.id,
        content: 'Update order status',
      },
    );

    if (messageResponse.result.type !== 'confirmation') {
      throw new Error('Expected confirmation result');
    }
    const pending = messageResponse.result.pendingActions[0];
    if (!pending) {
      throw new Error('Expected pending action');
    }

    await expect(
      service.confirmAction(
        {
          tenantId: '66f100000000000000000001',
          userId: '66f1000000000000000000aa',
          roles: ['manager'],
        },
        {
          actionId: pending.actionId,
          confirmationToken: pending.confirmationToken,
        },
      ),
    ).rejects.toThrow('Assistant tool permission denied');
  });
});
