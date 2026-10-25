import { type FilterQuery, type Model, type SortOrder } from 'mongoose';
import type { Types } from 'mongoose';

import { ClinicModel } from '../../../shared/infrastructure/persistence/mongoose/models/clinic.model';
import { DoctorModel } from '../../../shared/infrastructure/persistence/mongoose/models/doctor.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';
import { type Patient, type PatientListQuery, type PatientUpdatePayload, type PatientWritePayload } from '../domain/patient';
import { type DoctorReference, type PatientListResult, type PatientRepository } from '../domain/patient-repository';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

const patientSortFields: Record<PatientListQuery['sortBy'], string> = {
  name: 'name',
  dob: 'dob',
  gender: 'gender',
  status: 'status',
  lastVisit: 'lastVisit',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export class MongoosePatientRepository implements PatientRepository {
  public async create(payload: PatientWritePayload, scope: DataVisibilityScope): Promise<Patient> {
    const created = await patientModel.create({
      ...payload,
      tenantId: scope.tenantId,
    });
    return this.toPatientRecord(created.toObject());
  }

  public async findById(patientId: string, scope: DataVisibilityScope): Promise<Patient | null> {
    const found = await patientModel.findOne({
      _id: patientId,
      tenantId: scope.tenantId,
      ...(await patientScopeFilter(scope)),
    })
      .lean<PatientRecord | null>()
      .exec();
    return found === null ? null : this.toPatientRecord(found);
  }

  public async list(query: PatientListQuery): Promise<PatientListResult> {
    const filter: FilterQuery<PatientRecord> = {
      tenantId: query.scope.tenantId,
      ...(query.search !== undefined
        ? {
            $or: [
              { name: new RegExp(escapeRegExp(query.search), 'i') },
              { email: new RegExp(escapeRegExp(query.search), 'i') },
              { phone: new RegExp(escapeRegExp(query.search), 'i') },
            ],
          }
        : {}),
      ...(query.statuses.length > 0 ? { status: { $in: query.statuses } } : {}),
    };

    const scopedFilter = await patientScopeFilter(query.scope);
    if (Object.keys(scopedFilter).length > 0) {
      Object.assign(filter, scopedFilter);
    }

    const sortValue: SortOrder = query.sortDirection === 'asc' ? 1 : -1;
    const sortBy = patientSortFields[query.sortBy];
    const skip = (query.page - 1) * query.pageSize;

    const [items, totalItems] = await Promise.all([
      patientModel.find(filter)
        .sort({ [sortBy]: sortValue })
        .skip(skip)
        .limit(query.pageSize)
        .lean<PatientRecord[]>()
        .exec(),
      patientModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((item) => this.toPatientRecord(item)),
      totalItems,
    };
  }

  public async update(
    patientId: string,
    payload: PatientUpdatePayload,
    scope: DataVisibilityScope,
  ): Promise<Patient | null> {
    const updated = await patientModel.findOneAndUpdate(
      {
        _id: patientId,
        tenantId: scope.tenantId,
        ...(await patientScopeFilter(scope)),
      },
      payload,
      { new: true },
    )
      .lean<PatientRecord | null>()
      .exec();

    return updated === null ? null : this.toPatientRecord(updated);
  }

  public async delete(patientId: string, scope: DataVisibilityScope): Promise<boolean> {
    const deleted = await patientModel.findOneAndDelete({
      _id: patientId,
      tenantId: scope.tenantId,
      ...(await patientScopeFilter(scope)),
    }).exec();

    return deleted !== null;
  }

  public async clinicExists(clinicId: string, scope: DataVisibilityScope): Promise<boolean> {
    const clinic = await clinicModel.findOne({
      _id: clinicId,
      tenantId: scope.tenantId,
    })
      .select('_id')
      .lean()
      .exec();

    return clinic !== null;
  }

  public async findDoctorById(doctorId: string, scope: DataVisibilityScope): Promise<DoctorReference | null> {
    const doctor = await doctorModel.findOne({
      _id: doctorId,
      tenantId: scope.tenantId,
    })
      .select('_id name clinicId')
      .lean()
      .exec();

    if (doctor === null) {
      return null;
    }

    return {
      id: doctor._id.toString(),
      name: doctor.name,
      clinicId: doctor.clinicId.toString(),
    };
  }

  public async findClinicNameById(clinicId: string, scope: DataVisibilityScope): Promise<string | null> {
    const clinic = await clinicModel.findOne({
      _id: clinicId,
      tenantId: scope.tenantId,
    })
      .select('name')
      .lean()
      .exec();
    return clinic === null ? null : clinic.name;
  }

  public async findDoctorNameById(doctorId: string, scope: DataVisibilityScope): Promise<string | null> {
    const doctor = await doctorModel.findOne({
      _id: doctorId,
      tenantId: scope.tenantId,
    })
      .select('name')
      .lean()
      .exec();
    return doctor === null ? null : doctor.name;
  }

  public async countOrders(patientId: string, scope: DataVisibilityScope): Promise<number> {
    return orderModel.countDocuments({ tenantId: scope.tenantId, patientId }).exec();
  }

  private toPatientRecord(document: PatientRecord): Patient {
    return {
      id: document._id.toString(),
      name: document.name,
      dob: document.dob,
      gender: document.gender,
      phone: document.phone,
      email: document.email,
      clinicId: document.clinicId.toString(),
      doctorId: document.doctorId.toString(),
      status: document.status,
      lastVisit: document.lastVisit,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}

interface PatientRecord {
  _id: Types.ObjectId;
  name: string;
  dob: Date;
  gender: 'M' | 'F';
  phone: string;
  email: string;
  clinicId: Types.ObjectId;
  doctorId: Types.ObjectId;
  status: Patient['status'];
  lastVisit: Date;
  createdAt: Date;
  updatedAt: Date;
}

const patientModel = PatientModel as unknown as Model<PatientRecord>;
const clinicModel = ClinicModel as unknown as Model<{ _id: Types.ObjectId; tenantId: Types.ObjectId; name: string }>;
const doctorModel = DoctorModel as unknown as Model<{
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  clinicId: Types.ObjectId;
}>;
const orderModel = OrderModel as unknown as Model<{ _id: Types.ObjectId; tenantId: Types.ObjectId; patientId: Types.ObjectId }>;

async function patientScopeFilter(scope: DataVisibilityScope): Promise<Record<string, unknown>> {
  if (scope.isAdmin) {
    return {};
  }

  if (scope.isDoctor && scope.doctorId) {
    return { doctorId: scope.doctorId };
  }

  if (!scope.isTechnician) {
    if (scope.clinicId) {
      return { clinicId: scope.clinicId };
    }

    if (scope.isStaff || scope.isManager) {
      return {};
    }

    return { _id: { $in: [] as Types.ObjectId[] } };
  }

  const patientIds = await orderModel.distinct('patientId', {
    tenantId: scope.tenantId,
    technicianId: scope.userId,
  }).exec();
  return { _id: { $in: patientIds } };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
