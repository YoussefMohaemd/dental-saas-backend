import mongoose, { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findOneAndUpdateMock, findOneAndDeleteMock, deleteManyMock } = vi.hoisted(() => ({
  findOneAndUpdateMock: vi.fn(),
  findOneAndDeleteMock: vi.fn(),
  deleteManyMock: vi.fn(),
}));

vi.mock('../../../shared/infrastructure/persistence/mongoose/models/order.model', () => ({
  OrderModel: {
    findOneAndUpdate: findOneAndUpdateMock,
    findOneAndDelete: findOneAndDeleteMock,
  },
}));

vi.mock('../../../shared/infrastructure/persistence/mongoose/models/sub-order.model', () => ({
  SubOrderModel: {
    deleteMany: deleteManyMock,
  },
}));

import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { MongooseOrdersRepository } from './mongoose-orders-repository';

const orderId = '66f100000000000000000013';

describe('MongooseOrdersRepository status-precondition filter', () => {
  it('includes status.$in from expectedCurrentStatuses alongside _id and tenantId', async () => {
    const scope = adminScope();
    const repository = new MongooseOrdersRepository();

    const result = await repository.updateOrder(
      orderId,
      { status: 'Review' },
      scope,
      { expectedCurrentStatuses: ['New', 'Design'] },
    );

    const { filter, update, options } = capturedFindOneAndUpdateCall();
    expect(filter).toMatchObject({
      _id: orderId,
      tenantId: scope.tenantId,
      status: { $in: ['New', 'Design'] },
    });
    expect(filter.status).toEqual({ $in: ['New', 'Design'] });
    expect(update).toMatchObject({ status: 'Review' });
    expect(options).toEqual({ new: true });
    expect(result).toBeNull();
  });

  it('omits the status precondition when constraints are not provided', async () => {
    const scope = adminScope();
    const repository = new MongooseOrdersRepository();

    await repository.updateOrder(orderId, { notes: 'updated' }, scope);

    const { filter } = capturedFindOneAndUpdateCall();
    expect(filter).toMatchObject({ _id: orderId, tenantId: scope.tenantId });
    expect(filter).not.toHaveProperty('status');
  });

  it('omits the status precondition when expectedCurrentStatuses is empty', async () => {
    const scope = adminScope();
    const repository = new MongooseOrdersRepository();

    await repository.updateOrder(orderId, { status: 'Review' }, scope, {
      expectedCurrentStatuses: [],
    });

    const { filter } = capturedFindOneAndUpdateCall();
    expect(filter).not.toHaveProperty('status');
  });

  it('falls back to non-transactional delete when MongoDB transactions are unsupported', async () => {
    const scope = adminScope();
    const repository = new MongooseOrdersRepository();

    const transactionError = Object.assign(
      new Error('Transaction numbers are only allowed on a replica set member or mongos'),
      { code: 20, codeName: 'IllegalOperation' },
    );

    const orderDeleteExecMock = vi
      .fn()
      .mockRejectedValueOnce(transactionError)
      .mockResolvedValueOnce({ _id: orderId });
    const subOrderDeleteExecMock = vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 2 });

    findOneAndDeleteMock.mockImplementation(() => ({
      session: () => ({ exec: orderDeleteExecMock }),
      exec: orderDeleteExecMock,
    }));
    deleteManyMock.mockImplementation(() => ({
      session: () => ({ exec: subOrderDeleteExecMock }),
      exec: subOrderDeleteExecMock,
    }));

    const withTransaction = vi.fn(async (work: () => Promise<void>) => {
      await work();
    });
    const endSession = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction,
      endSession,
    } as never);

    await expect(repository.deleteOrderWithSubOrders(orderId, scope)).resolves.toBe(true);
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(findOneAndDeleteMock).toHaveBeenCalledTimes(2);
    expect(deleteManyMock).toHaveBeenCalledTimes(1);
  });
});

function adminScope(): DataVisibilityScope {
  return {
    tenantId: new Types.ObjectId('66f100000000000000000002'),
    userId: new Types.ObjectId('66f100000000000000000003'),
    isAdmin: true,
  };
}

interface CapturedFindOneAndUpdateCall {
  filter: Record<string, unknown>;
  update: Record<string, unknown>;
  options: Record<string, unknown>;
}

function capturedFindOneAndUpdateCall(): CapturedFindOneAndUpdateCall {
  const calls = findOneAndUpdateMock.mock.calls as Array<
    [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>]
  >;
  const call = calls.at(0);
  if (call === undefined) {
    throw new Error('Expected orderModel.findOneAndUpdate to be called');
  }
  const [filter, update, options] = call;
  return { filter, update, options };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  findOneAndUpdateMock.mockImplementation(() => ({
    lean: () => ({
      exec: () => Promise.resolve(null),
    }),
  }));
  findOneAndDeleteMock.mockImplementation(() => ({
    session: () => ({
      exec: () => Promise.resolve({ _id: orderId }),
    }),
    exec: () => Promise.resolve({ _id: orderId }),
  }));
  deleteManyMock.mockImplementation(() => ({
    session: () => ({
      exec: () => Promise.resolve({ acknowledged: true, deletedCount: 0 }),
    }),
    exec: () => Promise.resolve({ acknowledged: true, deletedCount: 0 }),
  }));
});
