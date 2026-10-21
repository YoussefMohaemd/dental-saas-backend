import { type FilterQuery, type SortOrder, Types } from 'mongoose';
import { z } from 'zod';

import { type BillingRecordDto } from '../../../shared/application/contracts/dental-api-contract';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { buildPaginationMeta, type PaginationQuery } from '../../../shared/application/contracts/pagination';
import { BILLING_STATUSES } from '../../../shared/domain/entities/dental-data-model';
import { BillingRecordModel } from '../../../shared/infrastructure/persistence/mongoose/models/billing-record.model';
import { ClinicModel } from '../../../shared/infrastructure/persistence/mongoose/models/clinic.model';
import { DoctorModel } from '../../../shared/infrastructure/persistence/mongoose/models/doctor.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';
import { parseEnumList } from '../../../shared/presentation/http/http-utils';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

interface BillingRecord {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  orderId: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  clinicId: Types.ObjectId;
  amount: number;
  status: BillingRecordDto['status'];
  invoiceNumber?: string;
  invoiceDate?: Date;
  dueDate: Date;
  paidDate?: Date;
  vouchers: number;
  notes: string;
}

interface BillingListInput {
  pagination: PaginationQuery;
  search?: string | undefined;
  statuses?: BillingRecordDto['status'][] | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  sortBy: 'dueDate' | 'amount' | 'status' | 'createdAt' | 'updatedAt' | 'invoiceDate';
  sortDirection: 'asc' | 'desc';
  tenantId?: Types.ObjectId | undefined;
  scope?: DataVisibilityScope | undefined;
}

const billingPatchSchema = z
  .object({
    amount: z.coerce.number().min(0).optional(),
    status: z.enum(BILLING_STATUSES).optional(),
    invoiceNumber: z.string().trim().min(1).optional(),
    invoiceDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    paidDate: z.coerce.date().optional(),
    vouchers: z.coerce.number().int().min(0).optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required for billing update',
  });

export function parseBillingStatusFilters(value: unknown): BillingRecordDto['status'][] | undefined {
  return parseEnumList(value, BILLING_STATUSES);
}

export function parseOptionalDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  let parsedDate: Date;
  if (value instanceof Date) {
    parsedDate = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    parsedDate = new Date(value);
  } else {
    throw new ApplicationError({
      message: 'Expected date string value',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }

  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApplicationError({
      message: 'Invalid date value',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }

  return parsedDate;
}

export function parseBillingPatchPayload(value: unknown): z.infer<typeof billingPatchSchema> {
  return billingPatchSchema.parse(value);
}

export async function listBillingRecords(input: BillingListInput): Promise<{
  items: BillingRecordDto[];
  totalItems: number;
}> {
  const filter: FilterQuery<BillingRecord> = {};
  if (input.tenantId) {
    filter.tenantId = input.tenantId;
  }
  applyScopeFilter(filter, input.scope);

  if (input.statuses && input.statuses.length > 0) {
    filter.status = { $in: input.statuses };
  }

  if (input.dateFrom || input.dateTo) {
    const dueDateFilter: { $gte?: Date; $lte?: Date } = {};
    if (input.dateFrom) {
      dueDateFilter.$gte = input.dateFrom;
    }
    if (input.dateTo) {
      dueDateFilter.$lte = input.dateTo;
    }
    filter.dueDate = dueDateFilter;
  }

  if (input.search) {
    const searchRegex = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [{ invoiceNumber: searchRegex }, { notes: searchRegex }];
  }

  const totalItems = await BillingRecordModel.countDocuments(filter);
  const sort: Record<string, SortOrder> = {
    [input.sortBy]: input.sortDirection === 'asc' ? 1 : -1,
  };

  const records: BillingRecord[] = await BillingRecordModel.find(filter)
    .sort(sort)
    .skip((input.pagination.page - 1) * input.pagination.pageSize)
    .limit(input.pagination.pageSize)
    .lean<BillingRecord[]>()
    .exec();

  const [orderById, patientById, doctorById, clinicById] = await Promise.all([
    buildNamedMap(OrderModel, records.map((record) => record.orderId), 'orderNumber'),
    buildNamedMap(PatientModel, records.map((record) => record.patientId), 'name'),
    buildNamedMap(DoctorModel, records.map((record) => record.doctorId), 'name'),
    buildNamedMap(ClinicModel, records.map((record) => record.clinicId), 'name'),
  ]);

  return {
    items: records.map((record) => toBillingDto(record, orderById, patientById, doctorById, clinicById)),
    totalItems,
  };
}

export async function getBillingRecord(
  billingId: Types.ObjectId,
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Promise<BillingRecordDto> {
  const filter: FilterQuery<BillingRecord> = { _id: billingId };
  if (tenantId) {
    filter.tenantId = tenantId;
  }
  applyScopeFilter(filter, scope);

  const record = await BillingRecordModel.findOne(filter).lean<BillingRecord | null>().exec();
  if (!record) {
    throw new ApplicationError({
      message: 'Billing record not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  const [orderById, patientById, doctorById, clinicById] = await Promise.all([
    buildNamedMap(OrderModel, [record.orderId], 'orderNumber'),
    buildNamedMap(PatientModel, [record.patientId], 'name'),
    buildNamedMap(DoctorModel, [record.doctorId], 'name'),
    buildNamedMap(ClinicModel, [record.clinicId], 'name'),
  ]);

  return toBillingDto(record, orderById, patientById, doctorById, clinicById);
}

export async function updateBillingRecord(
  billingId: Types.ObjectId,
  payload: z.infer<typeof billingPatchSchema>,
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Promise<BillingRecordDto> {
  const filter: FilterQuery<BillingRecord> = { _id: billingId };
  if (tenantId) {
    filter.tenantId = tenantId;
  }
  applyScopeFilter(filter, scope);

  const record = await BillingRecordModel.findOneAndUpdate(
    filter,
    { $set: payload },
    {
      new: true,
      runValidators: true,
    },
  )
    .lean<BillingRecord | null>()
    .exec();

  if (!record) {
    throw new ApplicationError({
      message: 'Billing record not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  return getBillingRecord(record._id, tenantId, scope);
}

export { buildPaginationMeta };

function applyScopeFilter(
  filter: FilterQuery<BillingRecord>,
  scope?: DataVisibilityScope,
): void {
  if (!scope || scope.isAdmin) {
    return;
  }

  if (scope.doctorId) {
    filter.doctorId = scope.doctorId;
    return;
  }

  filter.clinicId = scope.clinicId ?? { $in: [] };
}

async function buildNamedMap<TDoc extends { _id: Types.ObjectId }>(
  model: {
    find(filter: Record<string, unknown>): {
      select(selection: Record<string, 1>): {
        lean<TLean>(): { exec(): Promise<TLean> };
      };
    };
  },
  ids: Types.ObjectId[],
  nameField: string,
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.map((id) => id.toString()))].map(
    (id) => new Types.ObjectId(id),
  );

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const records: Array<TDoc & Record<string, string>> = await model
    .find({ _id: { $in: uniqueIds } })
    .select({ _id: 1, [nameField]: 1 })
    .lean<Array<TDoc & Record<string, string>>>()
    .exec();

  return new Map(
    records.map((record) => [record._id.toString(), record[nameField] ?? '']),
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toBillingDto(
  record: BillingRecord,
  orderById: Map<string, string>,
  patientById: Map<string, string>,
  doctorById: Map<string, string>,
  clinicById: Map<string, string>,
): BillingRecordDto {
  return {
    id: record._id.toString(),
    orderId: record.orderId.toString(),
    orderNumber: orderById.get(record.orderId.toString()) ?? '',
    patientName: patientById.get(record.patientId.toString()) ?? '',
    doctorName: doctorById.get(record.doctorId.toString()) ?? '',
    clinicName: clinicById.get(record.clinicId.toString()) ?? '',
    amount: record.amount,
    status: record.status,
    ...(record.invoiceNumber ? { invoiceNumber: record.invoiceNumber } : {}),
    ...(record.invoiceDate ? { invoiceDate: record.invoiceDate.toISOString() } : {}),
    dueDate: record.dueDate.toISOString(),
    ...(record.paidDate ? { paidDate: record.paidDate.toISOString() } : {}),
    vouchers: record.vouchers,
    notes: record.notes,
  };
}
