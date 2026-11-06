import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findOneMock } = vi.hoisted(() => ({
  findOneMock: vi.fn(),
}));

vi.mock('../../../shared/infrastructure/persistence/mongoose/models/order.model', () => ({
  OrderModel: {
    findOne: findOneMock,
  },
}));

import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { MongooseOrdersRepository } from './mongoose-orders-repository';

describe('MongooseOrdersRepository visibility filter', () => {
  it('allows doctor to access own orders and orders created by the same user', async () => {
    const repository = new MongooseOrdersRepository();
    const scope = doctorScope();

    await repository.findOrderById('66f100000000000000000013', scope);

    const [filter] = capturedFindOneCall();
    expect(filter).toMatchObject({
      tenantId: scope.tenantId,
      $or: [{ doctorId: scope.doctorId }, { createdBy: scope.userId }],
    });
  });
});

function doctorScope(): DataVisibilityScope {
  return {
    tenantId: new Types.ObjectId('66f100000000000000000001'),
    userId: new Types.ObjectId('66f1000000000000000000aa'),
    doctorId: new Types.ObjectId('66f1000000000000000000bb'),
    clinicId: new Types.ObjectId('66f1000000000000000000cc'),
    isAdmin: false,
    isDoctor: true,
    isTechnician: false,
    isStaff: false,
    isManager: false,
  };
}

function capturedFindOneCall(): [Record<string, unknown>] {
  const calls = findOneMock.mock.calls as Array<[Record<string, unknown>]>;
  const call = calls.at(0);
  if (!call) {
    throw new Error('Expected orderModel.findOne to be called');
  }
  return call;
}

beforeEach(() => {
  vi.clearAllMocks();
  findOneMock.mockImplementation(() => ({
    lean: () => ({
      exec: () => Promise.resolve(null),
    }),
  }));
});
