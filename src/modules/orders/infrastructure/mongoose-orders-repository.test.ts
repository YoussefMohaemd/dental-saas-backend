import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findOneAndUpdateMock } = vi.hoisted(() => ({
  findOneAndUpdateMock: vi.fn(),
}));

vi.mock('../../../shared/infrastructure/persistence/mongoose/models/order.model', () => ({
  OrderModel: {
    findOneAndUpdate: findOneAndUpdateMock,
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
  findOneAndUpdateMock.mockImplementation(() => ({
    lean: () => ({
      exec: () => Promise.resolve(null),
    }),
  }));
});
