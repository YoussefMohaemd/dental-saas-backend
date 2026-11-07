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
    const createClinic = vi.fn().mockResolvedValue({
      id: 'clinic-new-1',
      name: 'Dental Care Clinic 2',
    });
    const listDoctors = vi.fn().mockResolvedValue({
      items: [],
      meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 },
    });
    const createDoctor = vi.fn().mockResolvedValue({
      id: 'doctor-new-1',
      name: 'Omar Khalil',
      clinicId: 'clinic-new-1',
    });
    const createPatient = vi.fn().mockResolvedValue({
      id: 'patient-1',
      name: 'yousseff',
      clinicId: 'clinic-new-1',
      doctorId: 'doctor-new-1',
    });

    const executor = new AssistantActionExecutor({
      ordersService: {} as never,
      patientService: { createPatient } as never,
      doctorService: { listDoctors, createDoctor } as never,
      clinicService: { listClinics, createClinic } as never,
      catalogRepository: {} as never,
    });

    const execution = await executor.executeConfirmedWriteAction({
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
    });

    expect(createClinic).toHaveBeenCalledTimes(1);
    expect(createDoctor).toHaveBeenCalledTimes(1);
    expect(createPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: 'clinic-new-1',
        doctorId: 'doctor-new-1',
      }),
      context.scope,
    );
    expect(execution.tool).toBe('create_patient');
  });
});
