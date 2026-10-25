import { type FilterQuery, type SortOrder, Types } from 'mongoose';
import { z } from 'zod';

import { type DocumentDto } from '../../../shared/application/contracts/dental-api-contract';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { buildPaginationMeta, type PaginationQuery } from '../../../shared/application/contracts/pagination';
import { DOCUMENT_CATEGORIES } from '../../../shared/domain/entities/dental-data-model';
import { DoctorModel } from '../../../shared/infrastructure/persistence/mongoose/models/doctor.model';
import { DocumentModel } from '../../../shared/infrastructure/persistence/mongoose/models/document.model';
import { ClinicModel } from '../../../shared/infrastructure/persistence/mongoose/models/clinic.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';
import { SubOrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/sub-order.model';
import { UserModel } from '../../../shared/infrastructure/persistence/mongoose/models/user.model';
import { parseEnumList } from '../../../shared/presentation/http/http-utils';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

interface DocumentRecord {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  category: DocumentDto['category'];
  type: string;
  sizeBytes: number;
  date: Date;
  doctorId?: Types.ObjectId;
  patientId?: Types.ObjectId;
  clinicId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  subOrderId?: Types.ObjectId;
}

const optionalObjectIdString = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Expected ObjectId string')
  .optional();

const createDocumentSchema = z.object({
  name: z.string().trim().min(1),
  category: z.enum(DOCUMENT_CATEGORIES),
  type: z.string().trim().min(1),
  sizeBytes: z.coerce.number().int().min(0),
  date: z.coerce.date().optional(),
  doctorId: optionalObjectIdString,
  patientId: optionalObjectIdString,
  clinicId: optionalObjectIdString,
  orderId: optionalObjectIdString,
  subOrderId: optionalObjectIdString,
}).strict();

export function parseDocumentCategoryFilters(value: unknown): DocumentDto['category'][] | undefined {
  return parseEnumList(value, DOCUMENT_CATEGORIES);
}

export function parseCreateDocumentPayload(value: unknown): z.infer<typeof createDocumentSchema> {
  return createDocumentSchema.parse(value);
}

export async function listDocuments(input: {
  pagination: PaginationQuery;
  search?: string | undefined;
  categories?: DocumentDto['category'][] | undefined;
  sortBy: 'name' | 'date' | 'sizeBytes' | 'category' | 'type';
  sortDirection: 'asc' | 'desc';
  tenantId?: Types.ObjectId | undefined;
}): Promise<{ items: DocumentDto[]; totalItems: number }> {
  const filter: FilterQuery<DocumentRecord> = {};
  if (input.tenantId) {
    filter.tenantId = input.tenantId;
  }

  if (input.categories && input.categories.length > 0) {
    filter.category = { $in: input.categories };
  }

  if (input.search) {
    const searchRegex = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [{ name: searchRegex }, { type: searchRegex }];
  }

  const totalItems = await DocumentModel.countDocuments(filter);
  const sort: Record<string, SortOrder> = {
    [input.sortBy]: input.sortDirection === 'asc' ? 1 : -1,
  };

  const records: DocumentRecord[] = await DocumentModel.find(filter)
    .sort(sort)
    .skip((input.pagination.page - 1) * input.pagination.pageSize)
    .limit(input.pagination.pageSize)
    .lean<DocumentRecord[]>()
    .exec();

  return {
    items: await mapDocuments(records, input.tenantId),
    totalItems,
  };
}

export async function getDocumentById(
  documentId: Types.ObjectId,
  tenantId?: Types.ObjectId,
): Promise<DocumentDto> {
  const filter: FilterQuery<DocumentRecord> = { _id: documentId };
  if (tenantId) {
    filter.tenantId = tenantId;
  }
  const record = await DocumentModel.findOne(filter).lean<DocumentRecord | null>().exec();
  if (!record) {
    throw new ApplicationError({
      message: 'Document not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  const [dto] = await mapDocuments([record], tenantId);
  if (!dto) {
    throw new ApplicationError({
      message: 'Document not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  return dto;
}

export async function createDocument(
  payload: z.infer<typeof createDocumentSchema>,
  scope: DataVisibilityScope,
): Promise<DocumentDto> {
  const tenantId = scope.tenantId;
  const references: boolean[] = await Promise.all([
    payload.doctorId
      ? DoctorModel.exists({ _id: new Types.ObjectId(payload.doctorId), tenantId })
          .exec()
          .then((record) => Boolean(record))
      : Promise.resolve(true),
    payload.patientId
      ? PatientModel.exists({ _id: new Types.ObjectId(payload.patientId), tenantId })
          .exec()
          .then((record) => Boolean(record))
      : Promise.resolve(true),
    payload.clinicId
      ? ClinicModel.exists({ _id: new Types.ObjectId(payload.clinicId), tenantId })
          .exec()
          .then((record) => Boolean(record))
      : Promise.resolve(true),
    payload.orderId
      ? OrderModel.exists({ _id: new Types.ObjectId(payload.orderId), tenantId })
          .exec()
          .then((record) => Boolean(record))
      : Promise.resolve(true),
    payload.subOrderId
      ? SubOrderModel.exists({ _id: new Types.ObjectId(payload.subOrderId), tenantId })
          .exec()
          .then((record) => Boolean(record))
      : Promise.resolve(true),
    UserModel.exists({ _id: scope.userId, tenantId })
      .exec()
      .then((record) => Boolean(record)),
  ]);

  if (references.some((reference) => !reference)) {
    throw new ApplicationError({
      message: 'Document references must belong to the authenticated tenant',
      statusCode: 422,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }

  const createdId = (
    (await DocumentModel.create({
      tenantId,
      name: payload.name,
      category: payload.category,
      type: payload.type,
      sizeBytes: payload.sizeBytes,
      date: payload.date ?? new Date(),
      doctorId: payload.doctorId ? new Types.ObjectId(payload.doctorId) : undefined,
      patientId: payload.patientId ? new Types.ObjectId(payload.patientId) : undefined,
      clinicId: payload.clinicId ? new Types.ObjectId(payload.clinicId) : undefined,
      orderId: payload.orderId ? new Types.ObjectId(payload.orderId) : undefined,
      subOrderId: payload.subOrderId ? new Types.ObjectId(payload.subOrderId) : undefined,
      uploadedBy: scope.userId,
    })) as { _id: Types.ObjectId }
  )._id;

  return getDocumentById(createdId, tenantId);
}

export async function deleteDocument(
  documentId: Types.ObjectId,
  tenantId?: Types.ObjectId,
): Promise<void> {
  const filter: FilterQuery<DocumentRecord> = { _id: documentId };
  if (tenantId) {
    filter.tenantId = tenantId;
  }
  const existingCount = await DocumentModel.countDocuments(filter).exec();
  if (existingCount === 0) {
    throw new ApplicationError({
      message: 'Document not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  await DocumentModel.deleteOne(filter).exec();
}

export { buildPaginationMeta };

async function mapDocuments(
  records: DocumentRecord[],
  tenantId?: Types.ObjectId,
): Promise<DocumentDto[]> {
  const ids = {
    doctor: new Set<string>(),
    patient: new Set<string>(),
    order: new Set<string>(),
  };
  for (const record of records) {
    if (record.doctorId) {
      ids.doctor.add(record.doctorId.toString());
    }
    if (record.patientId) {
      ids.patient.add(record.patientId.toString());
    }
    if (record.orderId) {
      ids.order.add(record.orderId.toString());
    }
  }

  const [doctors, patients, orders]: [
    Array<{ _id: Types.ObjectId; name: string }>,
    Array<{ _id: Types.ObjectId; name: string }>,
    Array<{ _id: Types.ObjectId; orderNumber: string }>,
  ] = await Promise.all([
    DoctorModel.find({
      _id: { $in: [...ids.doctor].map((id) => new Types.ObjectId(id)) },
      ...(tenantId ? { tenantId } : {}),
    })
      .select({ _id: 1, name: 1 })
      .lean<Array<{ _id: Types.ObjectId; name: string }>>()
      .exec(),
    PatientModel.find({
      _id: { $in: [...ids.patient].map((id) => new Types.ObjectId(id)) },
      ...(tenantId ? { tenantId } : {}),
    })
      .select({ _id: 1, name: 1 })
      .lean<Array<{ _id: Types.ObjectId; name: string }>>()
      .exec(),
    OrderModel.find({
      _id: { $in: [...ids.order].map((id) => new Types.ObjectId(id)) },
      ...(tenantId ? { tenantId } : {}),
    })
      .select({ _id: 1, orderNumber: 1 })
      .lean<Array<{ _id: Types.ObjectId; orderNumber: string }>>()
      .exec(),
  ]);

  const doctorMap = new Map<string, string>(
    doctors.map((doctor) => [doctor._id.toString(), doctor.name]),
  );
  const patientMap = new Map<string, string>(
    patients.map((patient) => [patient._id.toString(), patient.name]),
  );
  const orderMap = new Map<string, string>(
    orders.map((order) => [order._id.toString(), order.orderNumber]),
  );

  return records.map((record) => {
    const patientName = record.patientId
      ? patientMap.get(record.patientId.toString())
      : undefined;
    const orderNumber = record.orderId
      ? orderMap.get(record.orderId.toString())
      : undefined;

    return {
      id: record._id.toString(),
      name: record.name,
      category: record.category,
      type: record.type,
      size: toReadableSize(record.sizeBytes),
      date: record.date.toISOString(),
      doctor: record.doctorId ? doctorMap.get(record.doctorId.toString()) ?? '' : '',
      ...(patientName !== undefined ? { patientName } : {}),
      ...(record.orderId ? { orderId: record.orderId.toString() } : {}),
      ...(orderNumber !== undefined ? { orderNumber } : {}),
      ...(record.subOrderId ? { subOrderId: record.subOrderId.toString() } : {}),
    };
  });
}

function toReadableSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const sizeKb = sizeBytes / 1024;
  if (sizeKb < 1024) {
    return `${sizeKb.toFixed(1)} KB`;
  }

  return `${(sizeKb / 1024).toFixed(2)} MB`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
