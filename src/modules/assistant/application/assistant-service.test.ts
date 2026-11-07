import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { AssistantService } from './assistant-service';

function principal(roles: string[]) {
  return {
    tenantId: '66f100000000000000000001',
    userId: '66f1000000000000000000aa',
    roles,
    scope: {
      tenantId: new Types.ObjectId('66f100000000000000000001'),
      userId: new Types.ObjectId('66f1000000000000000000aa'),
      roles,
      isAdmin: roles.includes('admin'),
      isDoctor: roles.includes('doctor'),
      isTechnician: roles.includes('technician'),
      isStaff: roles.includes('staff'),
      isManager: roles.includes('manager'),
    },
  };
}

describe('AssistantService', () => {
  it('filters prompt suggestions by effective capabilities', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'ok',
        actions: [],
      },
    });

    const suggestions = await service.getSuggestions(principal(['manager']));

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
              payload: {
                orderNumber: 'ORD-1',
              },
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
    });

    const response = await service.postMessage(principal(['staff']), {
      conversationId: conversation.id,
      content: 'Create a new order for patient X',
    });

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
      service.postMessage(principal(['admin']), {
        conversationId: conversation.id,
        content: 'delete this order now',
      }),
    ).rejects.toThrow('Delete operations are blocked');
  });

  it('returns execution envelope for read actions', async () => {
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

    const response = await service.postMessage(principal(['staff']), {
      conversationId: conversation.id,
      content: 'Find order 24580',
    });

    expect(response.result.type).toBe('text');
    if (response.result.type !== 'text') {
      throw new Error('Expected text result');
    }
    expect(response.result.executions).toHaveLength(1);
    expect(response.result.executions[0]?.actionId).toBe('a1');
    expect(response.result.executions[0]?.tool).toBe('search_orders');
    expect(response.result.executions[0]?.status).toBe('executed');
  });

  it('executes confirmed write actions and blocks replay', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Preparing update',
        actions: [
          {
            id: 'a1',
            tool: 'update_order',
            arguments: {
              orderId: 'ord-1',
              payload: { status: 'Review' },
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
      title: 'Write execution',
    });

    const messageResponse = await service.postMessage(principal(['staff']), {
      conversationId: conversation.id,
      content: 'Update order status',
    });

    if (messageResponse.result.type !== 'confirmation') {
      throw new Error('Expected confirmation result');
    }
    const pending = messageResponse.result.pendingActions[0];
    if (!pending) {
      throw new Error('Expected pending action');
    }

    const confirm = await service.confirmAction(principal(['staff']), {
      actionId: pending.actionId,
      confirmationToken: pending.confirmationToken,
    });

    expect(confirm.message).toContain('executed');

    await expect(
      service.confirmAction(principal(['staff']), {
        actionId: pending.actionId,
        confirmationToken: pending.confirmationToken,
      }),
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
            arguments: {
              orderId: 'ord-2',
              payload: { status: 'Production' },
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
      title: 'Confirm policy',
    });

    const messageResponse = await service.postMessage(principal(['staff']), {
      conversationId: conversation.id,
      content: 'Update order status',
    });

    if (messageResponse.result.type !== 'confirmation') {
      throw new Error('Expected confirmation result');
    }
    const pending = messageResponse.result.pendingActions[0];
    if (!pending) {
      throw new Error('Expected pending action');
    }

    await expect(
      service.confirmAction(principal(['manager']), {
        actionId: pending.actionId,
        confirmationToken: pending.confirmationToken,
      }),
    ).rejects.toThrow('Assistant tool permission denied');
  });

  it('forces list_services execution when user asks for services/prices and model returns no actions', async () => {
    const service = AssistantService.create({
      provider: {
        name: 'mock',
        completePlan: async () => ({
          reply: 'Here is what I can help with.',
          actions: [],
        }),
      },
      conversationRepository: {
        create: async () => ({
          conversationId: 'conv-1',
          tenantId: '66f100000000000000000001',
          userId: '66f1000000000000000000aa',
          title: 'New conversation',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [
            {
              id: 'welcome',
              role: 'assistant',
              text: 'Welcome',
              resultType: 'text',
              createdAt: new Date(),
            },
          ],
        }),
        findOwnedConversation: async () => ({
          conversationId: 'conv-1',
          tenantId: '66f100000000000000000001',
          userId: '66f1000000000000000000aa',
          title: 'New conversation',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
        }),
        appendMessage: async () => undefined,
        listOwnedConversations: async () => [],
        updateStatus: async () => undefined,
      },
      pendingActionRepository: {
        create: async () => {
          throw new Error('not used in this test');
        },
        findOwnedPendingAction: async () => null,
        markConfirmed: async () => true,
      },
      auditRepository: {
        create: async () => undefined,
      },
      ordersService: {
        listOrders: async () => ({ items: [], meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 } }),
        getOrderById: async () => ({}),
      } as never,
      patientService: {
        listPatients: async () => ({ items: [], meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 } }),
        getPatientById: async () => ({}),
      } as never,
      doctorService: {
        listDoctors: async () => ({ items: [], meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 } }),
      } as never,
      clinicService: {
        listClinics: async () => ({ items: [], meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 } }),
      } as never,
      catalogRepository: {
        listServices: async () => [
          {
            serviceId: 'svc-1',
            name: 'Implant Planning',
            description: 'Digital planning service',
            basePrice: 450,
            turnaroundDays: 5,
            scanRequirements: [],
          },
        ],
        getCompanyProfile: async () => null,
      },
      options: {
        maxActionsPerMessage: 8,
        maxPlanningRounds: 4,
        maxInputChars: 4000,
        confirmationTtlSeconds: 900,
      },
    });

    const conversation = await service.createConversation({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      roles: ['admin'],
    });

    const response = await service.postMessage(principal(['admin']), {
      conversationId: conversation.id,
      content: 'show all services and prices',
    });

    expect(response.result.type).toBe('text');
    if (response.result.type !== 'text') {
      throw new Error('Expected text response');
    }
    expect(response.result.plannedActions).toBe(1);
    expect(response.result.executions[0]?.tool).toBe('list_services');
    expect(response.result.text).toContain('Implant Planning');
  });

  it('falls back to deterministic order search when model times out', async () => {
    const service = AssistantService.create({
      provider: {
        name: 'groq',
        completePlan: async () => {
          throw new ApplicationError({
            message: 'Assistant model request timed out',
            statusCode: 504,
            code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
            expose: true,
          });
        },
      },
      conversationRepository: {
        create: async () => ({
          conversationId: 'conv-2',
          tenantId: '66f100000000000000000001',
          userId: '66f1000000000000000000aa',
          title: 'New conversation',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [
            {
              id: 'welcome',
              role: 'assistant',
              text: 'Welcome',
              resultType: 'text',
              createdAt: new Date(),
            },
          ],
        }),
        findOwnedConversation: async () => ({
          conversationId: 'conv-2',
          tenantId: '66f100000000000000000001',
          userId: '66f1000000000000000000aa',
          title: 'New conversation',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
        }),
        appendMessage: async () => undefined,
        listOwnedConversations: async () => [],
        updateStatus: async () => undefined,
      },
      pendingActionRepository: {
        create: async () => {
          throw new Error('not used in this test');
        },
        findOwnedPendingAction: async () => null,
        markConfirmed: async () => true,
      },
      auditRepository: {
        create: async () => undefined,
      },
      ordersService: {
        listOrders: async () => ({
          items: [
            {
              id: '66f100000000000000000123',
              orderNumber: 'DL-026015',
              patientName: 'Sara Ahmed',
              doctorName: 'Omar Khalil',
              clinicName: 'Downtown Clinic',
              status: 'Review',
              restoration: 'Crown',
              amount: 900,
              dueDate: '2026-11-20T00:00:00.000Z',
            },
          ],
          meta: { totalItems: 1, page: 1, pageSize: 20, totalPages: 1 },
        }),
        getOrderById: async () => ({}),
      } as never,
      patientService: {
        listPatients: async () => ({ items: [], meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 } }),
        getPatientById: async () => ({}),
      } as never,
      doctorService: {
        listDoctors: async () => ({ items: [], meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 } }),
      } as never,
      clinicService: {
        listClinics: async () => ({ items: [], meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 } }),
      } as never,
      catalogRepository: {
        listServices: async () => [],
        getCompanyProfile: async () => null,
      },
      options: {
        maxActionsPerMessage: 8,
        maxPlanningRounds: 4,
        maxInputChars: 4000,
        confirmationTtlSeconds: 900,
      },
    });

    const conversation = await service.createConversation({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      roles: ['admin'],
    });

    const response = await service.postMessage(principal(['admin']), {
      conversationId: conversation.id,
      content: 'هاتلي الاوردرات الي عند دكتور Omar Khalil',
    });

    expect(response.result.type).toBe('text');
    if (response.result.type !== 'text') {
      throw new Error('Expected text response');
    }
    expect(response.result.plannedActions).toBe(1);
    expect(response.result.executions[0]?.tool).toBe('search_orders');
    expect(response.result.text).toContain('DL-026015');
  });

  it('falls back to get_company_info for company/about prompts when no actions are planned', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Sure, let me share more about us.',
        actions: [],
      },
    });

    const conversation = await service.createConversation({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      roles: ['staff'],
    });

    const response = await service.postMessage(principal(['staff']), {
      conversationId: conversation.id,
      content: 'Tell me about the company',
    });

    expect(response.result.type).toBe('text');
    if (response.result.type !== 'text') {
      throw new Error('Expected text result');
    }
    expect(
      response.result.executions.some((execution) => execution.tool === 'get_company_info'),
    ).toBe(true);
  });

  it('falls back to overdue search for delayed orders prompts when model returns no actions', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Here is what is overdue.',
        actions: [],
      },
    });

    const conversation = await service.createConversation({
      tenantId: '66f100000000000000000001',
      userId: '66f1000000000000000000aa',
      roles: ['staff'],
    });

    const response = await service.postMessage(principal(['staff']), {
      conversationId: conversation.id,
      content: 'Show delayed orders',
    });

    expect(response.result.type).toBe('text');
    if (response.result.type !== 'text') {
      throw new Error('Expected text result');
    }
    const execution = response.result.executions.find(
      (candidate) => candidate.tool === 'search_orders',
    );
    expect(execution).toBeDefined();
    // `overdueOnThisPage` is only populated by the executor when the planned
    // `search_orders` action carries `overdue: true`, so its presence proves
    // the fallback planned an overdue-specific search rather than a generic one.
    const resultMeta = (
      execution?.result as { meta?: { overdueOnThisPage?: number } } | undefined
    )?.meta;
    expect(resultMeta?.overdueOnThisPage).toBeTypeOf('number');
  });
});
