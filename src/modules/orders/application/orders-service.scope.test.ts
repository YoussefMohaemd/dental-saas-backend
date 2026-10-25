import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { type Order, type OrderWritePayload } from '../domain/order';
import { type OrderRepository } from '../domain/orders-repository';
import { type SubOrder, type SubOrderUpdatePayload } from '../domain/sub-order';
import { OrdersService } from './orders-service';

describe('OrdersService authorization scope', () => {
  it('forwards the authenticated tenant scope to relation and create operations', async () => {
    const scope: DataVisibilityScope = {
      tenantId: new Types.ObjectId('66f100000000000000000002'),
      userId: new Types.ObjectId('66f100000000000000000003'),
      isAdmin: true,
    };
    const repository = new RecordingOrdersRepository();
    const service = new OrdersService(repository);

    await service.createOrder(buildOrderPayload(), scope);

    expect(repository.relationScopes).toEqual([scope, scope, scope]);
    expect(repository.uniqueScope).toBe(scope);
    expect(repository.createScope).toBe(scope);
    expect(repository.referenceScope).toBe(scope);
  });
});

class RecordingOrdersRepository implements OrderRepository {
  public relationScopes: DataVisibilityScope[] = [];
  public uniqueScope: DataVisibilityScope | undefined;
  public createScope: DataVisibilityScope | undefined;
  public referenceScope: DataVisibilityScope | undefined;

  public async createOrder(_payload: OrderWritePayload, scope: DataVisibilityScope): Promise<Order> {
    await Promise.resolve();
    this.createScope = scope;
    return buildOrder();
  }

  public async findOrderById(): Promise<Order | null> {
    await Promise.resolve();
    return null;
  }

  public async listOrders(): Promise<{ items: Order[]; totalItems: number }> {
    await Promise.resolve();
    return { items: [], totalItems: 0 };
  }

  public async updateOrder(): Promise<Order | null> {
    await Promise.resolve();
    return null;
  }

  public async deleteOrder(): Promise<boolean> {
    await Promise.resolve();
    return false;
  }

  public async isOrderNumberTaken(
    _orderNumber: string,
    scope: DataVisibilityScope,
  ): Promise<boolean> {
    await Promise.resolve();
    this.uniqueScope = scope;
    return false;
  }

  public async findPatientById(_patientId: string, scope: DataVisibilityScope) {
    await Promise.resolve();
    this.relationScopes.push(scope);
    return { id: '66f100000000000000000010', name: 'Patient', doctorId: '66f100000000000000000011', clinicId: '66f100000000000000000012' };
  }

  public async findDoctorById(_doctorId: string, scope: DataVisibilityScope) {
    await Promise.resolve();
    this.relationScopes.push(scope);
    return { id: '66f100000000000000000011', name: 'Doctor', clinicId: '66f100000000000000000012' };
  }

  public async clinicExists(_clinicId: string, scope: DataVisibilityScope): Promise<boolean> {
    await Promise.resolve();
    this.relationScopes.push(scope);
    return true;
  }

  public async getNameReferences(_orders: Order[], scope: DataVisibilityScope) {
    await Promise.resolve();
    this.referenceScope = scope;
    return {
      patientById: new Map([['66f100000000000000000010', 'Patient']]),
      doctorById: new Map([['66f100000000000000000011', 'Doctor']]),
      clinicById: new Map([['66f100000000000000000012', 'Clinic']]),
      technicianById: new Map<string, string>(),
      scanCenterById: new Map<string, string>(),
    };
  }

  public async technicianExists(): Promise<boolean> {
    await Promise.resolve();
    return true;
  }

  public async changeRequestExists(): Promise<boolean> {
    await Promise.resolve();
    return true;
  }

  public findScanCenterNameById(): string | null {
    return null;
  }

  public async listSubOrders(): Promise<SubOrder[]> {
    await Promise.resolve();
    return [];
  }

  public async findSubOrderById(): Promise<SubOrder | null> {
    await Promise.resolve();
    return null;
  }

  public async createSubOrders(): Promise<SubOrder[]> {
    await Promise.resolve();
    return [];
  }

  public async replaceSubOrders(): Promise<SubOrder[]> {
    await Promise.resolve();
    return [];
  }

  public async updateSubOrder(
    _orderId: string,
    _subOrderId: string,
    _payload: SubOrderUpdatePayload,
    _scope: DataVisibilityScope,
  ): Promise<SubOrder | null> {
    void _orderId;
    void _subOrderId;
    void _payload;
    void _scope;
    await Promise.resolve();
    return null;
  }

  public async deleteSubOrder(): Promise<boolean> {
    await Promise.resolve();
    return false;
  }

  public async deleteSubOrdersByOrder(): Promise<void> {
    await Promise.resolve();
    return undefined;
  }
}

function buildOrderPayload(): OrderWritePayload {
  return {
    orderNumber: 'ORD-1',
    patientId: '66f100000000000000000010',
    doctorId: '66f100000000000000000011',
    clinicId: '66f100000000000000000012',
    status: 'New',
    priority: 'Normal',
    restoration: 'Crown',
    arch: 'Maxilla',
    format: 'Full',
    shade: 'A2',
    units: 1,
    amount: 100,
    billed: false,
    billTo: 'Doctor',
    vouchers: 0,
    isLocked: false,
    hasNotes: false,
    notes: '',
    receivedAt: new Date('2026-01-01'),
    dueDate: new Date('2026-01-02'),
  };
}

function buildOrder(): Order {
  return {
    ...buildOrderPayload(),
    id: '66f100000000000000000013',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}
