import { type FilterQuery, type Model, type SortOrder, Types } from 'mongoose';

import { type CaseDto } from '../../../shared/application/contracts/dental-api-contract';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import {
  type PaginationMeta,
  type PaginationQuery,
} from '../../../shared/application/contracts/pagination';
import { buildPaginationMeta } from '../../../shared/application/contracts/pagination';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { CASE_STATUSES } from '../../../shared/domain/entities/dental-data-model';
import { CaseModel } from '../../../shared/infrastructure/persistence/mongoose/models/case.model';
import { ClinicModel } from '../../../shared/infrastructure/persistence/mongoose/models/clinic.model';
import { DoctorModel } from '../../../shared/infrastructure/persistence/mongoose/models/doctor.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';

const caseModel = CaseModel as unknown as Model<CaseRecord>;

interface CaseRecord {
  _id: Types.ObjectId;
  caseNumber: string;
  title: string;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  clinicId: Types.ObjectId;
  status: CaseDto['status'];
  priority: CaseDto['priority'];
  ordersCount: number;
  filesCount: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CasesListInput {
  pagination: PaginationQuery;
  search?: string | undefined;
  statuses?: CaseDto['status'][] | undefined;
  sortBy: 'caseNumber' | 'title' | 'createdAt' | 'updatedAt' | 'priority' | 'status';
  sortDirection: 'asc' | 'desc';
  tenantId?: Types.ObjectId | undefined;
  scope?: DataVisibilityScope | undefined;
}

interface CasesListResult {
  items: CaseDto[];
  pagination: PaginationMeta;
}

export interface CreateCaseInput {
  caseNumber: string;
  title: string;
  patientId: string;
  doctorId: string;
  clinicId: string;
  status: CaseDto['status'];
  priority: CaseDto['priority'];
  notes: string;
  tenantId: Types.ObjectId;
  scope: DataVisibilityScope;
}

export async function createCase(input: CreateCaseInput): Promise<CaseDto> {
  assertCreateCaseScope(input);

  const [patient, doctor, clinic] = await Promise.all([
    PatientModel.findOne({
      _id: input.patientId,
      tenantId: input.tenantId,
      ...(input.scope.doctorId ? { doctorId: input.scope.doctorId } : {}),
      ...(input.scope.clinicId ? { clinicId: input.scope.clinicId } : {}),
    })
      .select({ _id: 1, name: 1, clinicId: 1, doctorId: 1 })
      .lean<{
        _id: Types.ObjectId;
        name: string;
        clinicId: Types.ObjectId;
        doctorId: Types.ObjectId;
      } | null>()
      .exec(),
    DoctorModel.findOne({
      _id: input.doctorId,
      tenantId: input.tenantId,
      ...(input.scope.clinicId ? { clinicId: input.scope.clinicId } : {}),
    })
      .select({ _id: 1, name: 1, clinicId: 1 })
      .lean<{ _id: Types.ObjectId; name: string; clinicId: Types.ObjectId } | null>()
      .exec(),
    ClinicModel.findOne({
      _id: input.clinicId,
      tenantId: input.tenantId,
    })
      .select({ _id: 1, name: 1 })
      .lean<{ _id: Types.ObjectId; name: string } | null>()
      .exec(),
  ]);

  if (!patient || !doctor || !clinic) {
    throw new ApplicationError({
      message: 'Patient, doctor, and clinic must be valid existing records',
      statusCode: 422,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }

  if (
    patient.clinicId.toString() !== input.clinicId ||
    patient.doctorId.toString() !== input.doctorId ||
    doctor.clinicId.toString() !== input.clinicId
  ) {
    throw new ApplicationError({
      message: 'Patient, doctor, and clinic must belong to the same care team',
      statusCode: 422,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }

  const duplicate = await caseModel.exists({
    tenantId: input.tenantId,
    caseNumber: input.caseNumber,
  }).exec();
  if (duplicate) {
    throw new ApplicationError({
      message: `Case number '${input.caseNumber}' already exists`,
      statusCode: 409,
      code: APPLICATION_ERROR_CODES.CONFLICT,
      expose: true,
    });
  }

  const created = await caseModel.create({
    tenantId: input.tenantId,
    caseNumber: input.caseNumber,
    title: input.title,
    patientId: input.patientId,
    doctorId: input.doctorId,
    clinicId: input.clinicId,
    status: input.status,
    priority: input.priority,
    ordersCount: 0,
    filesCount: 0,
    notes: input.notes,
  });

  return getCaseById(created._id, input.tenantId);
}

function assertCreateCaseScope(input: CreateCaseInput): void {
  const { scope } = input;

  if (scope.isAdmin || scope.isStaff || scope.isManager) {
    return;
  }

  if (scope.doctorId && scope.doctorId.toString() !== input.doctorId) {
    throw new ApplicationError({
      message: 'Doctors can only create cases for their own profile',
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      expose: true,
    });
  }

  if (scope.clinicId && scope.clinicId.toString() !== input.clinicId) {
    throw new ApplicationError({
      message: 'Case clinic must match the authenticated clinic scope',
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      expose: true,
    });
  }
}

export async function listCases(input: CasesListInput): Promise<CasesListResult> {
  const filter: FilterQuery<CaseRecord> = {};
  if (input.tenantId) {
    filter.tenantId = input.tenantId;
  }
  applyScopeFilter(filter, input.scope);

  if (input.statuses && input.statuses.length > 0) {
    filter.status = { $in: input.statuses };
  }

  if (input.search) {
    const searchRegex = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [{ caseNumber: searchRegex }, { title: searchRegex }, { notes: searchRegex }];
  }

  const totalItems = await caseModel.countDocuments(filter);
  const skip = (input.pagination.page - 1) * input.pagination.pageSize;
  const sort: Record<string, SortOrder> = {
    [input.sortBy]: input.sortDirection === 'asc' ? 1 : -1,
  };

  const records: CaseRecord[] = await caseModel.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(input.pagination.pageSize)
    .lean<CaseRecord[]>()
    .exec();

  const ids = collectRelatedIds(records);
  const [patients, doctors, clinics] = await Promise.all([
    PatientModel.find({ _id: { $in: ids.patientIds }, tenantId: input.tenantId })
      .select({ _id: 1, name: 1 })
      .lean<Array<{ _id: Types.ObjectId; name: string }>>()
      .exec(),
    DoctorModel.find({ _id: { $in: ids.doctorIds }, tenantId: input.tenantId })
      .select({ _id: 1, name: 1 })
      .lean<Array<{ _id: Types.ObjectId; name: string }>>()
      .exec(),
    ClinicModel.find({ _id: { $in: ids.clinicIds }, tenantId: input.tenantId })
      .select({ _id: 1, name: 1 })
      .lean<Array<{ _id: Types.ObjectId; name: string }>>()
      .exec(),
  ]);

  const patientById = createNameMap(patients);
  const doctorById = createNameMap(doctors);
  const clinicById = createNameMap(clinics);

  const items = records.map((record) => toCaseDto(record, patientById, doctorById, clinicById));

  return {
    items,
    pagination: buildPaginationMeta(totalItems, input.pagination),
  };
}

export async function getCaseById(
  caseId: Types.ObjectId,
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Promise<CaseDto> {
  const filter: FilterQuery<CaseRecord> = { _id: caseId };
  if (tenantId) {
    filter.tenantId = tenantId;
  }
  applyScopeFilter(filter, scope);

  const record = await caseModel.findOne(filter).lean<CaseRecord | null>().exec();
  if (!record) {
    throw new ApplicationError({
      message: 'Case not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  const [patient, doctor, clinic] = await Promise.all([
    PatientModel.findOne({ _id: record.patientId, ...(tenantId ? { tenantId } : {}) })
      .select({ _id: 1, name: 1 })
      .lean<{ _id: Types.ObjectId; name: string } | null>()
      .exec(),
    DoctorModel.findOne({ _id: record.doctorId, ...(tenantId ? { tenantId } : {}) })
      .select({ _id: 1, name: 1 })
      .lean<{ _id: Types.ObjectId; name: string } | null>()
      .exec(),
    ClinicModel.findOne({ _id: record.clinicId, ...(tenantId ? { tenantId } : {}) })
      .select({ _id: 1, name: 1 })
      .lean<{ _id: Types.ObjectId; name: string } | null>()
      .exec(),
  ]);

  return toCaseDto(
    record,
    createNameMap(patient ? [patient] : []),
    createNameMap(doctor ? [doctor] : []),
    createNameMap(clinic ? [clinic] : []),
  );
}

function applyScopeFilter(filter: FilterQuery<CaseRecord>, scope?: DataVisibilityScope): void {
  if (!scope || scope.isAdmin) {
    return;
  }

  if (scope.doctorId) {
    filter.doctorId = scope.doctorId;
    return;
  }

  filter.clinicId = scope.clinicId ?? { $in: [] };
}

export function parseCaseStatusFilters(value: unknown): CaseDto['status'][] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const rawStatuses =
    typeof value === 'string'
      ? value.split(',')
      : Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : [];
  const statuses = rawStatuses.map((entry) => entry.trim()).filter((entry) => entry.length > 0);

  if (statuses.length === 0) {
    return undefined;
  }

  const invalidStatus = statuses.find(
    (status) => !CASE_STATUSES.includes(status as (typeof CASE_STATUSES)[number]),
  );
  if (invalidStatus) {
    throw new ApplicationError({
      message: `Invalid case status "${invalidStatus}"`,
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: {
        allowedStatuses: CASE_STATUSES,
      },
    });
  }

  return statuses as CaseDto['status'][];
}

function toCaseDto(
  record: CaseRecord,
  patientById: Map<string, string>,
  doctorById: Map<string, string>,
  clinicById: Map<string, string>,
): CaseDto {
  const patientId = record.patientId.toString();
  const doctorId = record.doctorId.toString();
  const clinicId = record.clinicId.toString();

  return {
    id: record._id.toString(),
    caseNumber: record.caseNumber,
    title: record.title,
    patientId,
    patientName: patientById.get(patientId) ?? '',
    doctorId,
    doctorName: doctorById.get(doctorId) ?? '',
    clinicId,
    clinicName: clinicById.get(clinicId) ?? '',
    status: record.status,
    priority: record.priority,
    ordersCount: record.ordersCount,
    filesCount: record.filesCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    notes: record.notes,
  };
}

function createNameMap(items: Array<{ _id: Types.ObjectId; name: string }>): Map<string, string> {
  return new Map(items.map((item) => [item._id.toString(), item.name]));
}

function collectRelatedIds(records: CaseRecord[]): {
  patientIds: Types.ObjectId[];
  doctorIds: Types.ObjectId[];
  clinicIds: Types.ObjectId[];
} {
  const patientIds = new Set<string>();
  const doctorIds = new Set<string>();
  const clinicIds = new Set<string>();

  for (const record of records) {
    patientIds.add(record.patientId.toString());
    doctorIds.add(record.doctorId.toString());
    clinicIds.add(record.clinicId.toString());
  }

  return {
    patientIds: [...patientIds].map((id) => new Types.ObjectId(id)),
    doctorIds: [...doctorIds].map((id) => new Types.ObjectId(id)),
    clinicIds: [...clinicIds].map((id) => new Types.ObjectId(id)),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
