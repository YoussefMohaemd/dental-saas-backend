import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import {
  InMemoryAssistantAuditRepository,
  InMemoryAssistantConversationRepository,
  InMemoryAssistantPendingActionRepository,
} from '../infrastructure/persistence/in-memory-assistant-repositories';
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
  it('rejects create plans when create tools are disabled', async () => {
    const service = AssistantService.createForTests({
      createToolsEnabled: false,
      providerReply: {
        reply: 'Preparing draft',
        actions: [
          {
            id: 'a1',
            tool: 'create_order',
            arguments: { payload: {} },
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

    await expect(
      service.postMessage(principal(['staff']), {
        conversationId: conversation.id,
        content: 'Create an order',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

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

  it('rejects plans that include more than one write action in a single message', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Preparing draft',
        actions: [
          {
            id: 'a1',
            tool: 'create_order',
            arguments: {
              payload: {
                patientId: '66f100000000000000000111',
                doctorId: '66f100000000000000000222',
                clinicId: '66f100000000000000000333',
                format: 'STL',
                shade: 'A2',
                dueDate: '2026-11-20T00:00:00.000Z',
                creationData: {
                  services: [{ serviceId: 'treatment-plan', selectedTeeth: [11] }],
                },
              },
            },
            dependsOn: [],
          },
          {
            id: 'a2',
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
    });

    await expect(
      service.postMessage(principal(['staff']), {
        conversationId: conversation.id,
        content: 'Create one order and update another order',
      }),
    ).rejects.toMatchObject({
      message: 'Only one write action is allowed per assistant message',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
    });
  });

  it('accepts minimal create-order draft with ids and required fields', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Preparing draft',
        actions: [
          {
            id: 'a1',
            tool: 'create_order',
            arguments: {
              payload: {
                patientId: '66f100000000000000000111',
                doctorId: '66f100000000000000000222',
                clinicId: '66f100000000000000000333',
                format: 'STL',
                shade: 'A2',
                dueDate: '2026-11-20T00:00:00.000Z',
                creationData: {
                  services: [{ serviceId: 'treatment-plan', selectedTeeth: [12] }],
                },
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

  it('accepts create-order draft with names and resolves them in backend', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Preparing draft',
        actions: [
          {
            id: 'a1',
            tool: 'create_order',
            arguments: {
              payload: {
                patientName: 'Adam Wael',
                doctorName: 'Mostafa Samir',
                clinicName: 'Dental Care Clinic 10',
                format: 'STL',
                shade: 'A2',
                dueDate: '2026-11-20T00:00:00.000Z',
                creationData: {
                  services: [{ serviceId: 'treatment-plan', selectedTeeth: [11] }],
                },
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

  it('keeps explicit clinicId in create-order pending payload', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Preparing draft',
        actions: [
          {
            id: 'a1',
            tool: 'create_order',
            arguments: {
              payload: {
                patientId: '96889346eeb97e3c70caa914',
                doctorId: '66f100000000000000000222',
                clinicId: 'f5d9afd005f77d5531ffefe5',
                format: 'STL',
                shade: 'A2',
                dueDate: '2026-11-20T00:00:00.000Z',
                creationData: {
                  services: [{ serviceId: 'treatment-plan', selectedTeeth: [12, 34] }],
                },
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
      content: 'Create order for patient',
    });

    expect(response.result.type).toBe('confirmation');
    if (response.result.type !== 'confirmation') {
      throw new Error('Expected confirmation result');
    }

    const pending = response.result.pendingActions[0];
    expect(pending).toBeDefined();
    expect((pending?.payload as { payload?: { clinicId?: string } }).payload?.clinicId).toBe(
      'f5d9afd005f77d5531ffefe5',
    );
  });

  it('accepts create-order when model leaks dependsOn inside arguments', async () => {
    const service = AssistantService.createForTests({
      providerReply: {
        reply: 'Preparing draft',
        actions: [
          {
            id: 'a1',
            tool: 'create_order',
            arguments: {
              payload: {
                patientId: '66f100000000000000000111',
                doctorId: '66f100000000000000000222',
                clinicId: '66f100000000000000000333',
                format: 'STL',
                shade: 'A2',
                dueDate: '2026-11-20T00:00:00.000Z',
                creationData: {
                  services: [{ serviceId: 'treatment-plan', selectedTeeth: [21] }],
                },
              },
              dependsOn: [],
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

  it('rejects invalid write drafts before creating pending confirmation', async () => {
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

    await expect(
      service.postMessage(principal(['staff']), {
        conversationId: conversation.id,
        content: 'Create a new order for patient X',
      }),
    ).rejects.toThrow('create_order requires patientId or patientName');
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

  it('keeps service/pricing prompts action-free when model returns no actions', async () => {
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
        markProcessing: async () => true,
        markPending: async () => true,
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
    expect(response.result.plannedActions).toBe(0);
    expect(response.result.executions).toHaveLength(0);
    expect(response.result.text).toContain('Here is what I can help with.');
  });

  it('propagates timeout when model times out instead of deterministic fallback', async () => {
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
        markProcessing: async () => true,
        markPending: async () => true,
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

    await expect(
      service.postMessage(principal(['admin']), {
        conversationId: conversation.id,
        content: 'هاتلي الاوردرات الي عند دكتور Omar Khalil',
      }),
    ).rejects.toThrow('Assistant model request timed out');
  });

  it('retries planning without history when provider fails with upstream bad gateway', async () => {
    const provider = {
      name: 'vllm' as const,
      completePlan: vi
        .fn()
        .mockImplementationOnce(async () => {
          throw new ApplicationError({
            message: 'vLLM completion request failed',
            statusCode: 502,
            code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          });
        })
        .mockImplementationOnce(async (request: { history?: unknown[] }) => ({
          reply: request.history?.length === 0 ? 'Recovered without history.' : 'Unexpected',
          actions: [],
        })),
    };

    const service = AssistantService.create({
      provider,
      conversationRepository: {
        create: async () => ({
          conversationId: 'conv-3',
          tenantId: '66f100000000000000000001',
          userId: '66f1000000000000000000aa',
          title: 'New conversation',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [
            {
              id: 'm-prev-user',
              role: 'user',
              text: 'previous question',
              resultType: 'text',
              createdAt: new Date(),
            },
            {
              id: 'm-prev-assistant',
              role: 'assistant',
              text: 'previous answer',
              resultType: 'text',
              createdAt: new Date(),
            },
          ],
        }),
        findOwnedConversation: async () => ({
          conversationId: 'conv-3',
          tenantId: '66f100000000000000000001',
          userId: '66f1000000000000000000aa',
          title: 'New conversation',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [
            {
              id: 'm-prev-user',
              role: 'user',
              text: 'previous question',
              resultType: 'text',
              createdAt: new Date(),
            },
            {
              id: 'm-prev-assistant',
              role: 'assistant',
              text: 'previous answer',
              resultType: 'text',
              createdAt: new Date(),
            },
          ],
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
        markProcessing: async () => true,
        markPending: async () => true,
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
      roles: ['staff'],
    });

    const response = await service.postMessage(principal(['staff']), {
      conversationId: conversation.id,
      content: 'show service prices',
    });

    expect(response.result.type).toBe('text');
    expect(provider.completePlan).toHaveBeenCalledTimes(2);
    const secondCallArgs = provider.completePlan.mock.calls[1]?.[0] as { history?: unknown[] } | undefined;
    expect(secondCallArgs?.history).toEqual([]);
  });

  it('does not inject fallback catalog actions when model intentionally returns no actions', async () => {
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
    expect(response.result.executions).toHaveLength(0);
  });

  it('keeps pending action confirmable after transient execution failure', async () => {
    const updateOrder = vi
      .fn()
      .mockRejectedValueOnce(
        new ApplicationError({
          message: 'Temporary upstream failure',
          statusCode: 503,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          expose: true,
        }),
      )
      .mockResolvedValueOnce({ id: 'ord-1', status: 'Review' });

    const provider = {
      name: 'mock' as const,
      completePlan: vi.fn().mockResolvedValue({
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
      }),
    };

    const service = AssistantService.create({
      provider,
      conversationRepository: new InMemoryAssistantConversationRepository(),
      pendingActionRepository: new InMemoryAssistantPendingActionRepository(),
      auditRepository: new InMemoryAssistantAuditRepository(),
      ordersService: {
        listOrders: async () => ({
          items: [{ id: 'ord-1', orderNumber: 'ORD-1' }],
          meta: { totalItems: 1, page: 1, pageSize: 20, totalPages: 1 },
        }),
        getOrderById: async () => ({
          id: 'ord-1',
          dueDate: new Date().toISOString(),
          priority: 'Normal',
          notes: '',
        }),
        updateOrder,
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
      roles: ['staff'],
    });

    const messageResponse = await service.postMessage(principal(['staff']), {
      conversationId: conversation.id,
      content: 'Update order status',
    });
    expect(messageResponse.result.type).toBe('confirmation');
    if (messageResponse.result.type !== 'confirmation') {
      throw new Error('Expected confirmation result');
    }

    const pending = messageResponse.result.pendingActions[0];
    if (!pending) {
      throw new Error('Expected pending action');
    }

    await expect(
      service.confirmAction(principal(['staff']), {
        actionId: pending.actionId,
        confirmationToken: pending.confirmationToken,
      }),
    ).rejects.toThrow('Temporary upstream failure');

    const secondAttempt = await service.confirmAction(principal(['staff']), {
      actionId: pending.actionId,
      confirmationToken: pending.confirmationToken,
    });
    expect(secondAttempt.status).toBe('confirmed');
    expect(updateOrder).toHaveBeenCalledTimes(2);
  });

  it('falls back to catalog actions when model is rate-limited for pricing requests', async () => {
    const provider = {
      name: 'groq' as const,
      completePlan: vi.fn().mockRejectedValue(
        new ApplicationError({
          message: 'Groq completion request failed',
          statusCode: 502,
          code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
          details: {
            status: 429,
            statusText: 'Too Many Requests',
          },
        }),
      ),
    };

    const service = AssistantService.create({
      provider,
      conversationRepository: {
        create: async () => ({
          conversationId: 'conv-rate-limit',
          tenantId: '66f100000000000000000001',
          userId: '66f1000000000000000000aa',
          title: 'New conversation',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
        }),
        findOwnedConversation: async () => ({
          conversationId: 'conv-rate-limit',
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
        markProcessing: async () => true,
        markPending: async () => true,
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
            serviceId: 'svc-treatment-plan',
            name: 'Treatment Plan',
            description: 'Comprehensive treatment planning',
            basePrice: 250,
            turnaroundDays: 5,
            scanRequirements: ['Full arch STL'],
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
      roles: ['staff'],
    });

    const response = await service.postMessage(principal(['staff']), {
      conversationId: conversation.id,
      content: 'Show the price of every service.',
    });

    expect(response.result.type).toBe('text');
    if (response.result.type !== 'text') {
      throw new Error('Expected text result');
    }
    expect(response.result.executions.length).toBeGreaterThan(0);
    expect(response.result.executions.map((execution) => execution.tool)).toContain(
      'list_service_prices',
    );
  });

  it('does not force overdue search when model returns no actions', async () => {
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
    expect(response.result.executions).toHaveLength(0);
  });
});
