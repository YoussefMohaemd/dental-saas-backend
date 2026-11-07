import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { AssistantActionExecutor } from './assistant-action-executor';
import { formatExecutionsAsMarkdown } from './assistant-result-formatter';
import { AssistantToolDefinition } from '../domain/assistant.types';
import { buildAssistantToolRegistry } from './tool-registry';
import { ConfirmationService } from './confirmation-service';
import { InMemoryAssistantPendingActionRepository } from '../infrastructure/persistence/in-memory-assistant-repositories';

const context = {
  scope: {
    tenantId: new Types.ObjectId('66f100000000000000000001'),
    userId: new Types.ObjectId('66f1000000000000000000aa'),
    roles: ['staff'] as string[],
    isAdmin: false,
    isDoctor: false,
    isTechnician: false,
    isStaff: true,
    isManager: false,
  },
  tenantId: '66f100000000000000000001',
} as const;

const tenantId = '66f100000000000000000001';
const userId = '66f1000000000000000000aa';

describe('ConfirmationService atomic claim', () => {
  it('lets only one of two concurrent confirmations through', async () => {
    const service = new ConfirmationService(new InMemoryAssistantPendingActionRepository(), 900);
    const pending = await service.createPendingAction({
      conversationId: 'c1',
      tenantId,
      userId,
      toolName: 'create_clinic',
      payload: { payload: {} },
    });

    const attempt = () =>
      service.confirmPendingAction({
        actionId: pending.actionId,
        tenantId,
        userId,
        confirmationToken: pending.confirmationToken,
      });
    const results = await Promise.allSettled([attempt(), attempt()]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('returns the payload so the UI can show what will really run', async () => {
    const service = new ConfirmationService(new InMemoryAssistantPendingActionRepository(), 900);
    const pending = await service.createPendingAction({
      conversationId: 'c1',
      tenantId,
      userId,
      toolName: 'create_clinic',
      payload: { payload: { name: 'Nile Clinic' } },
    });

    expect(pending.payload).toEqual({ payload: { name: 'Nile Clinic' } });
  });
});

describe('AssistantActionExecutor overdue + partial failure', () => {
  const readTool = (name: string): AssistantToolDefinition => ({
    name,
    description: '',
    argumentsHint: '{}',
    operationType: 'read',
    requiredCapabilities: [],
    capabilityMatchMode: 'all',
    requiresConfirmation: false,
    timeoutMs: 20_000,
    auditMetadata: { domain: 'x', action: 'x' },
  });

  it('search_orders overdue=true only returns open orders past due, oldest first', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const listOrders = vi.fn().mockResolvedValue({
      items: [
        { id: '1', orderNumber: 'DL-1', dueDate: past },
        { id: '2', orderNumber: 'DL-2', dueDate: future },
      ],
      meta: { totalItems: 2, page: 1, pageSize: 100, totalPages: 1 },
    });
    const executor = new AssistantActionExecutor({
      ordersService: { listOrders } as never,
      patientService: {} as never,
      doctorService: {} as never,
      clinicService: {} as never,
      catalogRepository: {} as never,
    });

    const [run] = await executor.executeReadActions(
      [{ id: 'a1', tool: 'search_orders', arguments: { overdue: true }, dependsOn: [] }],
      new Map([['a1', readTool('search_orders')]]),
      context,
    );

    const query = listOrders.mock.calls[0]?.[0] as { statuses: string[]; sortBy: string };
    expect(query.sortBy).toBe('dueDate');
    expect(query.statuses).not.toContain('Completed');
    expect(query.statuses).not.toContain('Cancelled');
    expect((run?.result as { items: Array<{ id: string }> }).items.map((item) => item.id)).toEqual(
      ['1'],
    );
  });

  it('one failing read does not hide the others and is never reported as executed', async () => {
    const executor = new AssistantActionExecutor({
      ordersService: {
        listOrders: vi.fn().mockRejectedValue(new Error('db down')),
      } as never,
      patientService: {} as never,
      doctorService: {} as never,
      clinicService: {} as never,
      catalogRepository: { listServices: vi.fn().mockResolvedValue([]) } as never,
    });

    const runs = await executor.executeReadActions(
      [
        { id: 'a1', tool: 'search_orders', arguments: {}, dependsOn: [] },
        { id: 'a2', tool: 'list_services', arguments: {}, dependsOn: [] },
      ],
      new Map([
        ['a1', readTool('search_orders')],
        ['a2', readTool('list_services')],
      ]),
      context,
    );

    expect(runs.map((run) => run.status)).toEqual(['failed', 'executed']);
    expect(formatExecutionsAsMarkdown(runs)).toContain('failed');
  });
});

describe('tool registry', () => {
  it('documents the overdue flag so the model can use it', () => {
    const hint = buildAssistantToolRegistry().get('search_orders').argumentsHint;
    expect(hint).toContain('overdue');
  });
});
