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
  uploadedBy?: Types.ObjectId;
}

interface DoctorScopeRecord {
  _id: Types.ObjectId;
  clinicId: Types.ObjectId;
}

interface PatientScopeRecord {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId;
  clinicId: Types.ObjectId;
}

interface OrderScopeRecord {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  clinicId: Types.ObjectId;
  technicianId?: Types.ObjectId;
}

interface SubOrderScopeRecord {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
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
  scope: DataVisibilityScope;
}): Promise<{ items: DocumentDto[]; totalItems: number }> {
  const filter: FilterQuery<DocumentRecord> = buildDocumentAccessFilter(input.scope);

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
    items: await mapDocuments(records, input.scope.tenantId),
    totalItems,
  };
}

export async function getDocumentById(
  documentId: Types.ObjectId,
  scope: DataVisibilityScope,
): Promise<DocumentDto> {
  const filter: FilterQuery<DocumentRecord> = {
    _id: documentId,
    ...buildDocumentAccessFilter(scope),
  };
  const record = await DocumentModel.findOne(filter).lean<DocumentRecord | null>().exec();
  if (!record) {
    throw new ApplicationError({
      message: 'Document not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  const [dto] = await mapDocuments([record], scope.tenantId);
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
  const scopedDoctorId = scope.isDoctor && scope.doctorId
    ? scope.doctorId.toString()
    : payload.doctorId;
  const scopedClinicId = scope.clinicId
    ? scope.clinicId.toString()
    : payload.clinicId;
  const scopedDoctorObjectId = scopedDoctorId ? new Types.ObjectId(scopedDoctorId) : undefined;
  const patientObjectId = payload.patientId ? new Types.ObjectId(payload.patientId) : undefined;
  const scopedClinicObjectId = scopedClinicId ? new Types.ObjectId(scopedClinicId) : undefined;
  const orderObjectId = payload.orderId ? new Types.ObjectId(payload.orderId) : undefined;
  const subOrderObjectId = payload.subOrderId ? new Types.ObjectId(payload.subOrderId) : undefined;

  assertScopedReferenceMatch(scope, scopedDoctorId, scopedClinicId);
  const [doctorRecord, patientRecord, clinicRecord, orderRecord, subOrderRecord, uploaderExists] = await Promise.all([
    scopedDoctorObjectId
      ? DoctorModel.findOne({
          _id: scopedDoctorObjectId,
          tenantId,
          ...buildDoctorScopeFilter(scope),
        })
          .select({ _id: 1, clinicId: 1 })
          .lean<DoctorScopeRecord | null>()
          .exec()
      : Promise.resolve(null),
    patientObjectId
      ? PatientModel.findOne({
          _id: patientObjectId,
          tenantId,
          ...buildPatientScopeFilter(scope),
        })
          .select({ _id: 1, doctorId: 1, clinicId: 1 })
          .lean<PatientScopeRecord | null>()
          .exec()
      : Promise.resolve(null),
    scopedClinicObjectId
      ? ClinicModel.findOne({
          _id: scopedClinicObjectId,
          tenantId,
          ...buildClinicScopeFilter(scope),
        })
          .select({ _id: 1 })
          .lean<{ _id: Types.ObjectId } | null>()
          .exec()
      : Promise.resolve(null),
    orderObjectId
      ? OrderModel.findOne({
          _id: orderObjectId,
          tenantId,
          ...buildOrderOwnershipFilter(scope),
        })
          .select({ _id: 1, patientId: 1, doctorId: 1, clinicId: 1 })
          .lean<OrderScopeRecord | null>()
          .exec()
      : Promise.resolve(null),
    subOrderObjectId
      ? SubOrderModel.findOne({
          _id: subOrderObjectId,
          tenantId,
        })
          .select({ _id: 1, orderId: 1 })
          .lean<SubOrderScopeRecord | null>()
          .exec()
      : Promise.resolve(null),
    UserModel.exists({ _id: scope.userId, tenantId })
      .exec()
      .then((record) => Boolean(record)),
  ]);

  const subOrderScopeOrder = subOrderRecord
    ? await OrderModel.findOne({
        _id: subOrderRecord.orderId,
        tenantId,
        ...buildOrderOwnershipFilter(scope),
      })
        .select({ _id: 1 })
        .lean<{ _id: Types.ObjectId } | null>()
        .exec()
    : null;

  if (
    !uploaderExists ||
    (scopedDoctorObjectId && !doctorRecord) ||
    (patientObjectId && !patientRecord) ||
    (scopedClinicObjectId && !clinicRecord) ||
    (orderObjectId && !orderRecord) ||
    (subOrderObjectId && (!subOrderRecord || !subOrderScopeOrder))
  ) {
    throw new ApplicationError({
      message: 'Document references must belong to the authenticated tenant and access scope',
      statusCode: 422,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }

  if (patientRecord && scopedDoctorObjectId && !isSameObjectId(patientRecord.doctorId, scopedDoctorObjectId)) {
    throwScopedRelationshipError('Document patient must belong to the selected doctor');
  }

  if (doctorRecord && scopedClinicObjectId && !isSameObjectId(doctorRecord.clinicId, scopedClinicObjectId)) {
    throwScopedRelationshipError('Document doctor must belong to the selected clinic');
  }

  if (patientRecord && scopedClinicObjectId && !isSameObjectId(patientRecord.clinicId, scopedClinicObjectId)) {
    throwScopedRelationshipError('Document patient must belong to the selected clinic');
  }

  if (orderRecord && patientObjectId && !isSameObjectId(orderRecord.patientId, patientObjectId)) {
    throwScopedRelationshipError('Document order must belong to the selected patient');
  }

  if (orderRecord && scopedDoctorObjectId && !isSameObjectId(orderRecord.doctorId, scopedDoctorObjectId)) {
    throwScopedRelationshipError('Document order must belong to the selected doctor');
  }

  if (orderRecord && scopedClinicObjectId && !isSameObjectId(orderRecord.clinicId, scopedClinicObjectId)) {
    throwScopedRelationshipError('Document order must belong to the selected clinic');
  }

  if (subOrderRecord && orderObjectId && !isSameObjectId(subOrderRecord.orderId, orderObjectId)) {
    throwScopedRelationshipError('Document sub-order must belong to the selected order');
  }

  const createdId = (
    (await DocumentModel.create({
      tenantId,
      name: payload.name,
      category: payload.category,
      type: payload.type,
      sizeBytes: payload.sizeBytes,
      date: payload.date ?? new Date(),
      doctorId: scopedDoctorObjectId,
      patientId: patientObjectId,
      clinicId: scopedClinicObjectId,
      orderId: orderObjectId,
      subOrderId: subOrderObjectId,
      uploadedBy: scope.userId,
    })) as { _id: Types.ObjectId }
  )._id;

  return getDocumentById(createdId, scope);
}

export async function deleteDocument(
  documentId: Types.ObjectId,
  scope: DataVisibilityScope,
): Promise<void> {
  const filter: FilterQuery<DocumentRecord> = {
    _id: documentId,
    ...buildDocumentAccessFilter(scope),
  };
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

function buildDocumentAccessFilter(scope: DataVisibilityScope): FilterQuery<DocumentRecord> {
  const baseFilter: FilterQuery<DocumentRecord> = {
    tenantId: scope.tenantId,
  };

  if (scope.isAdmin) {
    return baseFilter;
  }

  if (scope.isDoctor && scope.doctorId) {
    return {
      ...baseFilter,
      doctorId: scope.doctorId,
    };
  }

  if (scope.clinicId) {
    return {
      ...baseFilter,
      clinicId: scope.clinicId,
    };
  }

  if (scope.isTechnician) {
    return {
      ...baseFilter,
      uploadedBy: scope.userId,
    };
  }

  if (scope.isStaff || scope.isManager) {
    return baseFilter;
  }

  return {
    ...baseFilter,
    _id: { $in: [] as Types.ObjectId[] },
  };
}

function assertScopedReferenceMatch(
  scope: DataVisibilityScope,
  doctorId: string | undefined,
  clinicId: string | undefined,
): void {
  if (scope.isDoctor && scope.doctorId && doctorId && scope.doctorId.toString() !== doctorId) {
    throw new ApplicationError({
      message: 'Doctors can only create documents under their own profile',
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      expose: true,
    });
  }

  if (scope.clinicId && clinicId && scope.clinicId.toString() !== clinicId) {
    throw new ApplicationError({
      message: 'Document clinic must match the authenticated clinic scope',
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      expose: true,
    });
  }
}

function throwScopedRelationshipError(message: string): never {
  throw new ApplicationError({
    message,
    statusCode: 422,
    code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
    expose: true,
  });
}

function isSameObjectId(left: Types.ObjectId | undefined, right: Types.ObjectId): boolean {
  return Boolean(left && left.equals(right));
}

function buildDoctorScopeFilter(scope: DataVisibilityScope): FilterQuery<DoctorScopeRecord> {
  const filter: FilterQuery<DoctorScopeRecord> = {};

  if (scope.doctorId) {
    filter._id = scope.doctorId;
  }

  if (scope.clinicId) {
    filter.clinicId = scope.clinicId;
  }

  return filter;
}

function buildPatientScopeFilter(scope: DataVisibilityScope): FilterQuery<PatientScopeRecord> {
  const filter: FilterQuery<PatientScopeRecord> = {};

  if (scope.doctorId) {
    filter.doctorId = scope.doctorId;
  }

  if (scope.clinicId) {
    filter.clinicId = scope.clinicId;
  }

  return filter;
}

function buildClinicScopeFilter(scope: DataVisibilityScope): FilterQuery<{ _id: Types.ObjectId }> {
  if (scope.clinicId) {
    return { _id: scope.clinicId };
  }

  return {};
}

function buildOrderOwnershipFilter(scope: DataVisibilityScope): FilterQuery<OrderScopeRecord> {
  if (scope.isAdmin) {
    return {};
  }

  if (scope.isDoctor && scope.doctorId) {
    return { doctorId: scope.doctorId };
  }

  if (scope.isTechnician) {
    return { technicianId: scope.userId };
  }

  if (scope.clinicId) {
    return { clinicId: scope.clinicId };
  }

  if (scope.isStaff || scope.isManager) {
    return {};
  }

  return { _id: { $in: [] as Types.ObjectId[] } };
}

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
