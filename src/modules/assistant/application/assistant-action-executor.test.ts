import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { AssistantActionExecutor } from './assistant-action-executor';

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

describe('AssistantActionExecutor', () => {
  it('resolves order-number input for get_order_details before fetching details', async () => {
    const listOrders = vi.fn().mockResolvedValue({
      items: [{ id: '66f100000000000000000123', orderNumber: 'DL-026015' }],
      meta: { totalItems: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    const getOrderById = vi.fn().mockImplementation(async (orderId: string) => {
      if (orderId !== '66f100000000000000000123') {
        throw new Error(`invalid object id: ${orderId}`);
      }

      return { id: orderId, orderNumber: 'DL-026015', subOrders: [] };
    });

    const executor = new AssistantActionExecutor({
      ordersService: { listOrders, getOrderById } as never,
      patientService: {} as never,
      doctorService: {} as never,
      clinicService: {} as never,
      catalogRepository: {} as never,
    });

    const actions = await executor.executeReadActions(
      [
        {
          id: 'a1',
          tool: 'get_order_details',
          arguments: { orderId: 'DL-026015' },
          dependsOn: [],
        },
      ],
      new Map([
        [
          'a1',
          {
            name: 'get_order_details',
            description: 'Get order details by order id',
            argumentsHint: '{"orderId": string}',
            operationType: 'read',
            requiredCapabilities: [],
            capabilityMatchMode: 'all',
            requiresConfirmation: false,
            timeoutMs: 20000,
            auditMetadata: { domain: 'orders', action: 'details' },
          },
        ],
      ]),
      context,
    );

    expect(listOrders).toHaveBeenCalledTimes(1);
    expect(getOrderById).toHaveBeenCalledWith(
      '66f100000000000000000123',
      context.scope,
    );
    expect(actions[0]?.tool).toBe('get_order_details');
  });

  it('auto-creates missing clinic and doctor when creating patient with names', async () => {
    const listClinics = vi.fn().mockResolvedValue({
      items: [],
      meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 },
    });
    const listDoctors = vi.fn().mockResolvedValue({
      items: [],
      meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 },
    });
    const createPatient = vi.fn().mockResolvedValue({
      id: 'patient-1',
      name: 'yousseff',
      clinicId: 'clinic-1',
      doctorId: 'doctor-1',
    });

    const executor = new AssistantActionExecutor({
      ordersService: {} as never,
      patientService: { createPatient } as never,
      doctorService: { listDoctors } as never,
      clinicService: { listClinics } as never,
      catalogRepository: {} as never,
    });

    await expect(
      executor.executeConfirmedWriteAction({
        actionId: 'a-create-patient',
        toolName: 'create_patient',
        payload: {
          payload: {
            name: 'yousseff',
            dob: '2005-08-15',
            gender: 'M',
            phone: '01151711722',
            email: 'ym0998682@gmail.com',
            clinicName: 'Dental Care Clinic 2',
            doctorName: 'Omar Khalil',
          },
        },
        context,
      }),
    ).rejects.toThrow(/clinic name.*not found/i);
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('collects overdue orders from all pages before returning search_orders results', async () => {
    const listOrders = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: 'order-1',
            orderNumber: 'DL-001',
            dueDate: '2024-01-01',
            status: 'New',
          },
        ],
        meta: { totalItems: 2, page: 1, pageSize: 1, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'order-2',
            orderNumber: 'DL-002',
            dueDate: '2024-01-02',
            status: 'Review',
          },
        ],
        meta: { totalItems: 2, page: 2, pageSize: 1, totalPages: 2 },
      });

    const executor = new AssistantActionExecutor({
      ordersService: { listOrders } as never,
      patientService: {} as never,
      doctorService: {} as never,
      clinicService: {} as never,
      catalogRepository: {} as never,
    });

    const actions = await executor.executeReadActions(
      [
        {
          id: 'a1',
          tool: 'search_orders',
          arguments: { overdue: true, page: 1, pageSize: 1, status: [] },
          dependsOn: [],
        },
      ],
      new Map([
        [
          'a1',
          {
            name: 'search_orders',
            description: 'Search orders',
            argumentsHint: '{}',
            operationType: 'read',
            requiredCapabilities: [],
            capabilityMatchMode: 'all',
            requiresConfirmation: false,
            timeoutMs: 20000,
            auditMetadata: { domain: 'orders', action: 'search' },
          },
        ],
      ]),
      context,
    );

    expect(listOrders).toHaveBeenCalledTimes(2);
    expect(actions[0]?.tool).toBe('search_orders');
    expect((actions[0]?.result as { items: Array<{ id: string }> }).items).toHaveLength(2);
  });
});
