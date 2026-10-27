import { type FilterQuery, type SortOrder, Types } from 'mongoose';
import { z } from 'zod';

import { type ChangeRequestDto } from '../../../shared/application/contracts/dental-api-contract';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { buildPaginationMeta, type PaginationQuery } from '../../../shared/application/contracts/pagination';
import {
  CHANGE_REQUEST_STATUSES,
  PRIORITIES,
} from '../../../shared/domain/entities/dental-data-model';
import { ChangeRequestModel } from '../../../shared/infrastructure/persistence/mongoose/models/change-request.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';
import { UserModel } from '../../../shared/infrastructure/persistence/mongoose/models/user.model';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { parseEnumList } from '../../../shared/presentation/http/http-utils';

interface ChangeRequestRecord {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  requestNumber: string;
  orderId: Types.ObjectId;
  requesterId: Types.ObjectId;
  assigneeId?: Types.ObjectId;
  status: ChangeRequestDto['status'];
  priority: ChangeRequestDto['priority'];
  description: string;
  resolutionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ChangeRequestRequesterRecord {
  requesterId: Types.ObjectId;
}

const decisionPayloadSchema = z.object({
  status: z.enum(['Approved', 'Rejected', 'In Review', 'Completed'] as const),
  note: z.string().trim().max(5000).optional(),
}).strict();

export function parseChangeRequestStatuses(value: unknown): ChangeRequestDto['status'][] | undefined {
  return parseEnumList(value, CHANGE_REQUEST_STATUSES);
}

export function parseChangeRequestPriorities(value: unknown): ChangeRequestDto['priority'][] | undefined {
  return parseEnumList(value, PRIORITIES);
}

export function parseDecisionPayload(value: unknown): z.infer<typeof decisionPayloadSchema> {
  return decisionPayloadSchema.parse(value);
}

export function buildChangeRequestListFilter(input: {
  tenantId?: Types.ObjectId | undefined;
  statuses?: ChangeRequestDto['status'][] | undefined;
  priorities?: ChangeRequestDto['priority'][] | undefined;
  search?: string | undefined;
}): FilterQuery<ChangeRequestRecord> {
  const filter: FilterQuery<ChangeRequestRecord> = {};
  if (input.tenantId) {
    filter.tenantId = input.tenantId;
  }

  if (input.statuses && input.statuses.length > 0) {
    filter.status = { $in: input.statuses };
  }

  if (input.priorities && input.priorities.length > 0) {
    filter.priority = { $in: input.priorities };
  }

  if (input.search) {
    const searchRegex = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [{ requestNumber: searchRegex }, { description: searchRegex }];
  }

  return filter;
}

export function buildChangeRequestRequesterFilter(
  scope: DataVisibilityScope,
): FilterQuery<ChangeRequestRequesterRecord> | undefined {
  if (scope.isAdmin) {
    return undefined;
  }

  return { requesterId: scope.userId };
}

export function buildChangeRequestIdentityFilter(
  changeRequestId: Types.ObjectId,
  tenantId?: Types.ObjectId,
): FilterQuery<ChangeRequestRecord> {
  return {
    _id: changeRequestId,
    ...(tenantId ? { tenantId } : {}),
  };
}

export function buildDecisionUpdateDocument(
  payload: z.infer<typeof decisionPayloadSchema>,
): { $set: Partial<Pick<ChangeRequestRecord, 'status' | 'resolutionNote'>> } {
  return {
    $set: {
      status: payload.status,
      ...(payload.note !== undefined ? { resolutionNote: payload.note } : {}),
    },
  };
}

export async function listChangeRequests(input: {
  pagination: PaginationQuery;
  search?: string | undefined;
  statuses?: ChangeRequestDto['status'][] | undefined;
  priorities?: ChangeRequestDto['priority'][] | undefined;
  sortBy: 'createdAt' | 'updatedAt' | 'priority' | 'status' | 'requestNumber';
  sortDirection: 'asc' | 'desc';
  tenantId?: Types.ObjectId | undefined;
  scope?: DataVisibilityScope | undefined;
}): Promise<{ items: ChangeRequestDto[]; totalItems: number }> {
  const filter = buildChangeRequestListFilter(input);
  await applyChangeRequestScopeFilter(filter, input.scope);

  const totalItems = await ChangeRequestModel.countDocuments(filter);
  const sort: Record<string, SortOrder> = {
    [input.sortBy]: input.sortDirection === 'asc' ? 1 : -1,
  };

  const records: ChangeRequestRecord[] = await ChangeRequestModel.find(filter)
    .sort(sort)
    .skip((input.pagination.page - 1) * input.pagination.pageSize)
    .limit(input.pagination.pageSize)
    .lean<ChangeRequestRecord[]>()
    .exec();

  const orderMap = await buildMap(
    OrderModel,
    records.map((record) => record.orderId),
    'orderNumber',
    input.tenantId,
  );
  const requesterMap = await buildMap(
    UserModel,
    records.map((record) => record.requesterId),
    'fullName',
    input.tenantId,
  );
  const patientMap = await buildOrderPatientMap(records.map((record) => record.orderId), input.tenantId);

  return {
    items: records.map((record) => ({
      id: record._id.toString(),
      requestNumber: record.requestNumber,
      orderId: record.orderId.toString(),
      orderNumber: orderMap.get(record.orderId.toString()) ?? '',
      patientName: patientMap.get(record.orderId.toString()) ?? '',
      requester: requesterMap.get(record.requesterId.toString()) ?? '',
      status: record.status,
      priority: record.priority,
      description: record.description,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    })),
    totalItems,
  };
}

export async function getChangeRequest(
  changeRequestId: Types.ObjectId,
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Promise<ChangeRequestDto> {
  const filter = buildChangeRequestIdentityFilter(changeRequestId, tenantId);
  await applyChangeRequestScopeFilter(filter, scope);

  const record = await ChangeRequestModel.findOne(filter).lean<ChangeRequestRecord | null>().exec();
  if (!record) {
    throw new ApplicationError({
      message: 'Change request not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  const [orderMap, requesterMap, patientMap] = await Promise.all([
    buildMap(OrderModel, [record.orderId], 'orderNumber', tenantId),
    buildMap(UserModel, [record.requesterId], 'fullName', tenantId),
    buildOrderPatientMap([record.orderId], tenantId),
  ]);

  return {
    id: record._id.toString(),
    requestNumber: record.requestNumber,
    orderId: record.orderId.toString(),
    orderNumber: orderMap.get(record.orderId.toString()) ?? '',
    patientName: patientMap.get(record.orderId.toString()) ?? '',
    requester: requesterMap.get(record.requesterId.toString()) ?? '',
    status: record.status,
    priority: record.priority,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function decideChangeRequest(
  changeRequestId: Types.ObjectId,
  payload: z.infer<typeof decisionPayloadSchema>,
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Promise<ChangeRequestDto> {
  const filter = buildChangeRequestIdentityFilter(changeRequestId, tenantId);
  await applyChangeRequestScopeFilter(filter, scope);

  const record = await ChangeRequestModel.findOneAndUpdate(
    filter,
    buildDecisionUpdateDocument(payload),
    {
      new: true,
      runValidators: true,
    },
  )
    .lean<ChangeRequestRecord | null>()
    .exec();

  if (!record) {
    throw new ApplicationError({
      message: 'Change request not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  return getChangeRequest(record._id, tenantId, scope);
}

export { buildPaginationMeta };

async function applyChangeRequestScopeFilter(
  filter: FilterQuery<ChangeRequestRecord>,
  scope?: DataVisibilityScope,
): Promise<void> {
  if (!scope) {
    return;
  }

  const requesterFilter = buildChangeRequestRequesterFilter(scope);
  if (!requesterFilter) {
    return;
  }

  filter.requesterId = requesterFilter.requesterId;
}

async function buildMap(
  model: {
    find(filter: Record<string, unknown>): {
      select(selection: Record<string, 1>): {
        lean<TLean>(): { exec(): Promise<TLean> };
      };
    };
  },
  ids: Types.ObjectId[],
  field: string,
  tenantId?: Types.ObjectId,
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.map((id) => id.toString()))].map(
    (id) => new Types.ObjectId(id),
  );
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const records: Array<{ _id: Types.ObjectId } & Record<string, string>> = await model
    .find({ _id: { $in: uniqueIds }, ...(tenantId ? { tenantId } : {}) })
    .select({ _id: 1, [field]: 1 })
    .lean<Array<{ _id: Types.ObjectId } & Record<string, string>>>()
    .exec();

  return new Map(records.map((record) => [record._id.toString(), record[field] ?? '']));
}

async function buildOrderPatientMap(
  orderIds: Types.ObjectId[],
  tenantId?: Types.ObjectId,
): Promise<Map<string, string>> {
  const uniqueOrderIds = [...new Set(orderIds.map((id) => id.toString()))].map(
    (id) => new Types.ObjectId(id),
  );
  if (uniqueOrderIds.length === 0) {
    return new Map();
  }

  const orders: Array<{ _id: Types.ObjectId; patientId: Types.ObjectId }> = await OrderModel.find({
    _id: { $in: uniqueOrderIds },
    ...(tenantId ? { tenantId } : {}),
  })
    .select({ _id: 1, patientId: 1 })
    .lean<Array<{ _id: Types.ObjectId; patientId: Types.ObjectId }>>()
    .exec();

  const patientIds = [...new Set(orders.map((order) => order.patientId.toString()))].map(
    (id) => new Types.ObjectId(id),
  );

  const patients: Array<{ _id: Types.ObjectId; name: string }> = await PatientModel.find({
    _id: { $in: patientIds },
    ...(tenantId ? { tenantId } : {}),
  })
    .select({ _id: 1, name: 1 })
    .lean<Array<{ _id: Types.ObjectId; name: string }>>()
    .exec();

  const patientById = new Map(patients.map((patient) => [patient._id.toString(), patient.name]));
  return new Map(
    orders.map((order) => [
      order._id.toString(),
      patientById.get(order.patientId.toString()) ?? '',
    ]),
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
