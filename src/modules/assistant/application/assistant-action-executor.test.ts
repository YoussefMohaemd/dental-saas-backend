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
      catalogRepository: { listServices: vi.fn().mockResolvedValue([]) } as never,
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

  it('keeps explicit clinicId when create_order receives stale clinicId', async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: 'order-1' });
    const createSubOrders = vi.fn().mockResolvedValue([]);
    const patientId = '66f100000000000000000111';
    const patientClinicId = '66f100000000000000000333';
    const staleClinicId = 'f5d9afd005f77d5531ffefe5';
    const patientDoctorId = '66f100000000000000000222';

    const executor = new AssistantActionExecutor({
      ordersService: { createOrder, createSubOrders } as never,
      patientService: {
        getPatientById: vi.fn().mockResolvedValue({
          id: patientId,
          doctorId: patientDoctorId,
          clinicId: patientClinicId,
        }),
      } as never,
      doctorService: {
        getDoctorById: vi.fn().mockResolvedValue({ id: patientDoctorId, clinicId: patientClinicId }),
      } as never,
      clinicService: {
        getClinicById: vi.fn().mockResolvedValue({ id: patientClinicId }),
      } as never,
      catalogRepository: { listServices: vi.fn().mockResolvedValue([]) } as never,
    });

    await executor.executeConfirmedWriteAction({
      actionId: 'a-create-order',
      toolName: 'create_order',
      payload: {
        payload: {
          patientId,
          clinicId: staleClinicId,
          format: 'STL',
          shade: 'A2',
          dueDate: '2026-11-20T00:00:00.000Z',
          creationData: {
            services: [
              {
                serviceId: 'treatment-plan',
                selectedTeeth: [13, 33],
              },
            ],
          },
        },
      },
      context,
    });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId,
        doctorId: patientDoctorId,
        clinicId: staleClinicId,
      }),
      context.scope,
    );
  });

  it('accepts selectedTeeth values provided as numeric strings', async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: 'order-2' });
    const createSubOrders = vi.fn().mockResolvedValue([]);
    const patientId = '66f100000000000000000111';
    const clinicId = '66f100000000000000000333';
    const doctorId = '66f100000000000000000222';

    const executor = new AssistantActionExecutor({
      ordersService: { createOrder, createSubOrders } as never,
      patientService: {
        getPatientById: vi.fn().mockResolvedValue({
          id: patientId,
          doctorId,
          clinicId,
        }),
      } as never,
      doctorService: {
        getDoctorById: vi.fn().mockResolvedValue({ id: doctorId, clinicId }),
      } as never,
      clinicService: {
        getClinicById: vi.fn().mockResolvedValue({ id: clinicId }),
      } as never,
      catalogRepository: { listServices: vi.fn().mockResolvedValue([]) } as never,
    });

    await executor.executeConfirmedWriteAction({
      actionId: 'a-create-order-strings',
      toolName: 'create_order',
      payload: {
        payload: {
          patientId,
          format: 'STL',
          shade: 'A2',
          dueDate: '2026-11-20T00:00:00.000Z',
          creationData: {
            services: [
              {
                serviceId: 'treatment-plan',
                selectedTeeth: ['14', '33', '24'],
              },
            ],
          },
        },
      },
      context,
    });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        creationData: {
          services: [
            expect.objectContaining({
              serviceId: 'treatment-plan',
              selectedTeeth: [14, 33, 24],
            }),
          ],
        },
      }),
      context.scope,
    );
  });

  it('builds collision-resistant AI order numbers and derives units/amount from selected services', async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: 'order-5' });
    const createSubOrders = vi.fn().mockResolvedValue([]);
    const patientId = '66f100000000000000000111';
    const clinicId = '66f100000000000000000333';
    const doctorId = '66f100000000000000000222';

    const executor = new AssistantActionExecutor({
      ordersService: { createOrder, createSubOrders } as never,
      patientService: {
        getPatientById: vi.fn().mockResolvedValue({
          id: patientId,
          doctorId,
          clinicId,
        }),
      } as never,
      doctorService: {
        getDoctorById: vi.fn().mockResolvedValue({ id: doctorId, clinicId }),
      } as never,
      clinicService: {
        getClinicById: vi.fn().mockResolvedValue({ id: clinicId }),
      } as never,
      catalogRepository: {
        listServices: vi.fn().mockResolvedValue([
          {
            serviceId: 'treatment-plan',
            name: 'Treatment Plan',
            description: 'Comprehensive planning',
            basePrice: 250,
            turnaroundDays: 5,
            scanRequirements: ['Full arch STL'],
          },
        ]),
      } as never,
    });

    await executor.executeConfirmedWriteAction({
      actionId: 'a-create-order-defaults',
      toolName: 'create_order',
      payload: {
        payload: {
          patientId,
          format: 'STL',
          shade: 'A2',
          dueDate: '2026-11-20T00:00:00.000Z',
          creationData: {
            services: [
              {
                serviceId: 'treatment-plan',
                selectedTeeth: [12, 34, 24],
              },
            ],
          },
        },
      },
      context,
    });

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: expect.stringMatching(/^AI-\d{6}$/),
        units: 3,
        amount: 250,
      }),
      context.scope,
    );
  });

  it('creates sub-orders for assistant create_order services', async () => {
    const createOrder = vi.fn().mockResolvedValue({
      id: 'order-with-suborders',
    });
    const createSubOrders = vi.fn().mockResolvedValue([]);
    const patientId = '66f100000000000000000111';
    const clinicId = '66f100000000000000000333';
    const doctorId = '66f100000000000000000222';

    const executor = new AssistantActionExecutor({
      ordersService: { createOrder, createSubOrders } as never,
      patientService: {
        getPatientById: vi.fn().mockResolvedValue({
          id: patientId,
          doctorId,
          clinicId,
        }),
      } as never,
      doctorService: {
        getDoctorById: vi.fn().mockResolvedValue({ id: doctorId, clinicId }),
      } as never,
      clinicService: {
        getClinicById: vi.fn().mockResolvedValue({ id: clinicId }),
      } as never,
      catalogRepository: {
        listServices: vi.fn().mockResolvedValue([
          {
            serviceId: 'treatment-plan',
            name: 'Treatment Plan',
            description: 'Comprehensive planning',
            basePrice: 250,
            turnaroundDays: 5,
            scanRequirements: ['Full arch STL', 'Bite registration'],
          },
        ]),
      } as never,
    });

    await executor.executeConfirmedWriteAction({
      actionId: 'a-create-order-suborders',
      toolName: 'create_order',
      payload: {
        payload: {
          patientId,
          format: 'STL',
          shade: 'A2',
          dueDate: '2026-11-20T00:00:00.000Z',
          creationData: {
            services: [
              {
                serviceId: 'treatment-plan',
                serviceDetails: {},
                serviceForm: {},
                selectedTeeth: [11, 21],
              },
            ],
          },
        },
      },
      context,
    });

    expect(createSubOrders).toHaveBeenCalledWith(
      'order-with-suborders',
      [
        expect.objectContaining({
          service: 'Treatment Plan',
          teeth: [11, 21],
          scansTotal: 2,
          creationData: expect.objectContaining({
            serviceId: 'treatment-plan',
            selectedTeeth: [11, 21],
          }),
        }),
      ],
      context.scope,
    );
  });

  it('rejects unresolved patientId placeholders before querying patient repository', async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: 'order-4' });
    const createSubOrders = vi.fn().mockResolvedValue([]);
    const getPatientById = vi.fn();

    const executor = new AssistantActionExecutor({
      ordersService: { createOrder, createSubOrders } as never,
      patientService: {
        getPatientById,
      } as never,
      doctorService: {} as never,
      clinicService: {} as never,
      catalogRepository: { listServices: vi.fn().mockResolvedValue([]) } as never,
    });

    await expect(
      executor.executeConfirmedWriteAction({
        actionId: 'a-create-order-invalid-patient-id',
        toolName: 'create_order',
        payload: {
          payload: {
            patientId: '__RESOLVED_PATIENT_ID__',
            format: 'STL',
            shade: 'A2',
            dueDate: '2026-11-20T00:00:00.000Z',
            creationData: {
              services: [
                {
                  serviceId: 'treatment-plan',
                  selectedTeeth: [12, 32],
                },
              ],
            },
          },
        },
        context,
      }),
    ).rejects.toThrow('create_order requires valid patientId or patientName');

    expect(getPatientById).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('creates a new patient for create_order when patient name is not found', async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: 'order-new-patient' });
    const createSubOrders = vi.fn().mockResolvedValue([]);
    const createPatient = vi.fn().mockResolvedValue({
      id: '66f100000000000000000444',
      name: 'New Patient',
      doctorId: '66f100000000000000000222',
      clinicId: '66f100000000000000000333',
    });
    const listPatients = vi.fn().mockResolvedValue({
      items: [],
      meta: { totalItems: 0, page: 1, pageSize: 100, totalPages: 0 },
    });
    const doctorId = '66f100000000000000000222';
    const clinicId = '66f100000000000000000333';

    const executor = new AssistantActionExecutor({
      ordersService: { createOrder, createSubOrders } as never,
      patientService: { listPatients, createPatient } as never,
      doctorService: {
        getDoctorById: vi.fn().mockResolvedValue({ id: doctorId, clinicId }),
      } as never,
      clinicService: {
        getClinicById: vi.fn().mockResolvedValue({ id: clinicId }),
      } as never,
      catalogRepository: { listServices: vi.fn().mockResolvedValue([]) } as never,
    });

    await executor.executeConfirmedWriteAction({
      actionId: 'a-create-order-new-patient',
      toolName: 'create_order',
      payload: {
        payload: {
          patientName: 'New Patient',
          doctorId,
          dueDate: '2026-11-20T00:00:00.000Z',
          creationData: {
            services: [
              {
                serviceId: 'treatment-plan',
                selectedTeeth: [12, 22],
              },
            ],
          },
        },
      },
      context,
    });

    expect(createPatient).toHaveBeenCalledTimes(1);
    expect(createPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Patient',
        doctorId,
        clinicId,
      }),
      context.scope,
    );
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: '66f100000000000000000444',
        doctorId,
        clinicId,
        format: 'STL',
        shade: 'A2',
      }),
      context.scope,
    );
  });

  it('keeps explicit clinicId even when patient clinicId is stale', async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: 'order-3' });
    const createSubOrders = vi.fn().mockResolvedValue([]);
    const patientId = '66f100000000000000000111';
    const staleClinicId = 'f5d9afd005f77d5531ffefe5';
    const doctorId = '66f100000000000000000222';
    const doctorClinicId = '66f100000000000000000333';

    const executor = new AssistantActionExecutor({
      ordersService: { createOrder, createSubOrders } as never,
      patientService: {
        getPatientById: vi.fn().mockResolvedValue({
          id: patientId,
          doctorId,
          clinicId: staleClinicId,
        }),
      } as never,
      doctorService: {
        getDoctorById: vi.fn().mockResolvedValue({ id: doctorId, clinicId: doctorClinicId }),
      } as never,
      clinicService: {
        getClinicById: vi.fn().mockResolvedValue({ id: doctorClinicId }),
      } as never,
      catalogRepository: { listServices: vi.fn().mockResolvedValue([]) } as never,
    });

    await executor.executeConfirmedWriteAction({
      actionId: 'a-create-order-stale-patient-clinic',
      toolName: 'create_order',
      payload: {
        payload: {
          patientId,
          doctorId,
          clinicId: staleClinicId,
          format: 'STL',
          shade: 'A2',
          dueDate: '2026-11-20T00:00:00.000Z',
          creationData: {
            services: [
              {
                serviceId: 'surgical-guide',
                selectedTeeth: [12, 34],
              },
            ],
          },
        },
      },
      context,
    });

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId,
        doctorId,
        clinicId: staleClinicId,
      }),
      context.scope,
    );
  });

  it('rejects create_order draft when resolved clinic does not exist', async () => {
    const patientId = '66f100000000000000000111';
    const doctorId = '66f100000000000000000222';
    const missingClinicId = 'f5d9afd005f77d5531ffefe5';

    const executor = new AssistantActionExecutor({
      ordersService: {} as never,
      patientService: {
        getPatientById: vi.fn().mockResolvedValue({
          id: patientId,
          doctorId,
          clinicId: missingClinicId,
        }),
      } as never,
      doctorService: {
        getDoctorById: vi.fn().mockResolvedValue({ id: doctorId, clinicId: missingClinicId }),
      } as never,
      clinicService: {
        getClinicById: vi.fn().mockRejectedValue(new Error(`Clinic ${missingClinicId} was not found`)),
      } as never,
      catalogRepository: {} as never,
    });

    await expect(
      executor.validateWriteActionDraft({
        toolName: 'create_order',
        payload: {
          payload: {
            patientId,
            format: 'STL',
            shade: 'A2',
            dueDate: '2026-11-20T00:00:00.000Z',
            creationData: {
              services: [
                {
                  serviceId: 'treatment-plan',
                  selectedTeeth: [14, 33],
                },
              ],
            },
          },
        },
        context,
      }),
    ).rejects.toThrow(`Clinic ${missingClinicId} was not found`);
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

  it('prefers explicit doctorId and clinicId over patient-linked values in create_order', async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: 'order-explicit-ids' });
    const createSubOrders = vi.fn().mockResolvedValue([]);
    const patientId = '66f100000000000000000111';
    const explicitDoctorId = '66f100000000000000000555';
    const explicitClinicId = '66f100000000000000000666';

    const executor = new AssistantActionExecutor({
      ordersService: { createOrder, createSubOrders } as never,
      patientService: {
        getPatientById: vi.fn().mockResolvedValue({
          id: patientId,
          doctorId: '66f100000000000000000222',
          clinicId: '66f100000000000000000333',
        }),
      } as never,
      doctorService: {
        getDoctorById: vi.fn().mockImplementation(async (doctorId: string) => ({
          id: doctorId,
          clinicId: explicitClinicId,
        })),
      } as never,
      clinicService: {
        getClinicById: vi.fn().mockResolvedValue({ id: explicitClinicId }),
      } as never,
      catalogRepository: { listServices: vi.fn().mockResolvedValue([]) } as never,
    });

    await executor.executeConfirmedWriteAction({
      actionId: 'a-create-order-explicit-ids',
      toolName: 'create_order',
      payload: {
        payload: {
          patientId,
          doctorId: explicitDoctorId,
          clinicId: explicitClinicId,
          format: 'STL',
          shade: 'A2',
          dueDate: '2026-11-20T00:00:00.000Z',
          creationData: {
            services: [{ serviceId: 'treatment-plan', selectedTeeth: [11] }],
          },
        },
      },
      context,
    });

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId,
        doctorId: explicitDoctorId,
        clinicId: explicitClinicId,
      }),
      context.scope,
    );
  });

  it('does not silently fallback to patient-linked doctor when doctorName is explicitly provided', async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: 'order-doctor-name' });
    const createSubOrders = vi.fn().mockResolvedValue([]);
    const patientId = '66f100000000000000000111';
    const patientDoctorId = '66f100000000000000000222';
    const clinicId = '66f100000000000000000333';

    const executor = new AssistantActionExecutor({
      ordersService: { createOrder, createSubOrders } as never,
      patientService: {
        getPatientById: vi.fn().mockResolvedValue({
          id: patientId,
          doctorId: patientDoctorId,
          clinicId,
        }),
      } as never,
      doctorService: {
        listDoctors: vi.fn().mockResolvedValue({
          items: [],
          meta: { totalItems: 0, page: 1, pageSize: 20, totalPages: 0 },
        }),
        getDoctorById: vi.fn().mockResolvedValue({ id: patientDoctorId, clinicId }),
      } as never,
      clinicService: {
        getClinicById: vi.fn().mockResolvedValue({ id: clinicId }),
      } as never,
      catalogRepository: { listServices: vi.fn().mockResolvedValue([]) } as never,
    });

    await expect(
      executor.executeConfirmedWriteAction({
        actionId: 'a-create-order-doctor-name',
        toolName: 'create_order',
        payload: {
          payload: {
            patientId,
            doctorName: 'Unknown Doctor',
            clinicId,
            restoration: 'Crown',
            arch: 'Maxilla',
            format: 'STL',
            shade: 'A2',
            units: 1,
            amount: 100,
            dueDate: new Date().toISOString(),
          },
        },
        context,
      }),
    ).rejects.toThrow(/doctor .*not found/i);

    expect(createOrder).not.toHaveBeenCalled();
  });

  it('accepts update_order creationData.services payload', async () => {
    const updateOrder = vi.fn().mockResolvedValue({ id: 'order-update-1' });
    const replaceSubOrders = vi.fn().mockResolvedValue([]);
    const executor = new AssistantActionExecutor({
      ordersService: {
        updateOrder,
        replaceSubOrders,
      } as never,
      patientService: {} as never,
      doctorService: {} as never,
      clinicService: {} as never,
      catalogRepository: {
        listServices: vi.fn().mockResolvedValue([
          {
            serviceId: 'surgical-guide',
            name: 'Surgical Guide',
            description: 'desc',
            basePrice: 420,
            turnaroundDays: 8,
            scanRequirements: ['CBCT', 'STL'],
          },
        ]),
      } as never,
    });

    await executor.executeConfirmedWriteAction({
      actionId: 'a-update-order-services',
      toolName: 'update_order',
      payload: {
        orderId: '66f100000000000000000777',
        payload: {
          creationData: {
            services: [{ serviceId: 'surgical-guide', selectedTeeth: [14, 15] }],
          },
        },
      },
      context,
    });

    expect(updateOrder).toHaveBeenCalledWith(
      '66f100000000000000000777',
      expect.objectContaining({
        restoration: 'Implant Crown',
        units: 2,
        amount: 420,
        arch: 'Maxilla',
        creationData: {
          services: [
            expect.objectContaining({
              serviceId: 'surgical-guide',
              selectedTeeth: [14, 15],
            }),
          ],
        },
      }),
      context.scope,
    );
    expect(replaceSubOrders).toHaveBeenCalledWith(
      '66f100000000000000000777',
      [
        expect.objectContaining({
          service: 'Surgical Guide',
          teeth: [14, 15],
          scansTotal: 2,
          creationData: expect.objectContaining({
            serviceId: 'surgical-guide',
            selectedTeeth: [14, 15],
          }),
        }),
      ],
      context.scope,
    );
  });

  it('resolves update_order order number into object id before update', async () => {
    const updateOrder = vi.fn().mockResolvedValue({ id: 'order-update-2' });
    const listOrders = vi.fn().mockResolvedValue({
      items: [{ id: '66f100000000000000000888', orderNumber: 'DL-123' }],
      meta: { totalItems: 1, page: 1, pageSize: 20, totalPages: 1 },
    });

    const executor = new AssistantActionExecutor({
      ordersService: {
        listOrders,
        updateOrder,
      } as never,
      patientService: {} as never,
      doctorService: {} as never,
      clinicService: {} as never,
      catalogRepository: {} as never,
    });

    await executor.executeConfirmedWriteAction({
      actionId: 'a-update-order-by-number',
      toolName: 'update_order',
      payload: {
        orderId: 'DL-123',
        payload: { notes: 'updated' },
      },
      context,
    });

    expect(updateOrder).toHaveBeenCalledWith(
      '66f100000000000000000888',
      expect.objectContaining({ notes: 'updated' }),
      context.scope,
    );
  });
});
