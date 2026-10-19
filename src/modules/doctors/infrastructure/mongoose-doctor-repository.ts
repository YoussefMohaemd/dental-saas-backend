import { type FilterQuery, type Model, type SortOrder, Types } from 'mongoose';

import { ClinicModel } from '../../../shared/infrastructure/persistence/mongoose/models/clinic.model';
import { DoctorModel } from '../../../shared/infrastructure/persistence/mongoose/models/doctor.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';
import { type Doctor, type DoctorListQuery, type DoctorUpdatePayload, type DoctorWritePayload } from '../domain/doctor';
import { type DoctorListResult, type DoctorRepository } from '../domain/doctor-repository';

const DEFAULT_TENANT_ID = new Types.ObjectId('66f100000000000000000001');

const doctorSortFields: Record<DoctorListQuery['sortBy'], string> = {
  name: 'name',
  specialty: 'specialty',
  status: 'status',
  joinedDate: 'joinedDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export class MongooseDoctorRepository implements DoctorRepository {
  public async create(payload: DoctorWritePayload): Promise<Doctor> {
    const created = await doctorModel.create({
      ...payload,
      tenantId: DEFAULT_TENANT_ID,
    });
    return this.toDoctorRecord(created.toObject());
  }

  public async findById(doctorId: string): Promise<Doctor | null> {
    const found = await doctorModel.findOne({ _id: doctorId, tenantId: DEFAULT_TENANT_ID })
      .lean<DoctorRecord | null>()
      .exec();
    return found === null ? null : this.toDoctorRecord(found);
  }

  public async list(query: DoctorListQuery): Promise<DoctorListResult> {
    const filter: FilterQuery<DoctorRecord> = {
      tenantId: DEFAULT_TENANT_ID,
      ...(query.search !== undefined
        ? {
            $or: [
              { name: new RegExp(escapeRegExp(query.search), 'i') },
              { specialty: new RegExp(escapeRegExp(query.search), 'i') },
              { email: new RegExp(escapeRegExp(query.search), 'i') },
              { phone: new RegExp(escapeRegExp(query.search), 'i') },
            ],
          }
        : {}),
      ...(query.statuses.length > 0 ? { status: { $in: query.statuses } } : {}),
      ...(query.clinicId !== undefined ? { clinicId: query.clinicId } : {}),
    };

    const sortValue: SortOrder = query.sortDirection === 'asc' ? 1 : -1;
    const sortBy = doctorSortFields[query.sortBy];
    const skip = (query.page - 1) * query.pageSize;

    const [items, totalItems] = await Promise.all([
      doctorModel.find(filter)
        .sort({ [sortBy]: sortValue })
        .skip(skip)
        .limit(query.pageSize)
        .lean<DoctorRecord[]>()
        .exec(),
      doctorModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((item) => this.toDoctorRecord(item)),
      totalItems,
    };
  }

  public async update(doctorId: string, payload: DoctorUpdatePayload): Promise<Doctor | null> {
    const updated = await doctorModel.findOneAndUpdate(
      { _id: doctorId, tenantId: DEFAULT_TENANT_ID },
      payload,
      { new: true },
    )
      .lean<DoctorRecord | null>()
      .exec();

    return updated === null ? null : this.toDoctorRecord(updated);
  }

  public async delete(doctorId: string): Promise<boolean> {
    const deleted = await doctorModel.findOneAndDelete({
      _id: doctorId,
      tenantId: DEFAULT_TENANT_ID,
    }).exec();

    return deleted !== null;
  }

  public async existsByEmail(email: string, excludeDoctorId?: string): Promise<boolean> {
    const query = {
      tenantId: DEFAULT_TENANT_ID,
      email,
      ...(excludeDoctorId !== undefined ? { _id: { $ne: excludeDoctorId } } : {}),
    };
    const existing = await doctorModel.findOne(query).select('_id').lean().exec();
    return existing !== null;
  }

  public async existsByLookupId(lookupId: string, excludeDoctorId?: string): Promise<boolean> {
    const query = {
      tenantId: DEFAULT_TENANT_ID,
      lookupId,
      ...(excludeDoctorId !== undefined ? { _id: { $ne: excludeDoctorId } } : {}),
    };
    const existing = await doctorModel.findOne(query).select('_id').lean().exec();
    return existing !== null;
  }

  public async clinicExists(clinicId: string): Promise<boolean> {
    const existing = await clinicModel.findOne({
      _id: clinicId,
      tenantId: DEFAULT_TENANT_ID,
    })
      .select('_id')
      .lean()
      .exec();

    return existing !== null;
  }

  public async findClinicNameById(clinicId: string): Promise<string | null> {
    const clinic = await clinicModel.findOne({
      _id: clinicId,
      tenantId: DEFAULT_TENANT_ID,
    })
      .select('name')
      .lean()
      .exec();

    return clinic === null ? null : clinic.name;
  }

  public async hasPatients(doctorId: string): Promise<boolean> {
    const count = await patientModel.countDocuments({ tenantId: DEFAULT_TENANT_ID, doctorId }).exec();
    return count > 0;
  }

  public async countOrders(doctorId: string): Promise<number> {
    return orderModel.countDocuments({ tenantId: DEFAULT_TENANT_ID, doctorId }).exec();
  }

  private toDoctorRecord(document: DoctorRecord): Doctor {
    return {
      id: document._id.toString(),
      ...(document.lookupId !== undefined ? { lookupId: document.lookupId } : {}),
      name: document.name,
      specialty: document.specialty,
      clinicId: document.clinicId.toString(),
      email: document.email,
      phone: document.phone,
      status: document.status,
      joinedDate: document.joinedDate,
      avatar: document.avatar,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}

interface DoctorRecord {
  _id: Types.ObjectId;
  lookupId?: string;
  name: string;
  specialty: string;
  clinicId: Types.ObjectId;
  email: string;
  phone: string;
  status: Doctor['status'];
  joinedDate: Date;
  avatar: string;
  createdAt: Date;
  updatedAt: Date;
}

const doctorModel = DoctorModel as unknown as Model<DoctorRecord>;
const clinicModel = ClinicModel as unknown as Model<{ _id: Types.ObjectId; tenantId: Types.ObjectId; name: string }>;
const patientModel = PatientModel as unknown as Model<{ _id: Types.ObjectId; tenantId: Types.ObjectId; doctorId: Types.ObjectId }>;
const orderModel = OrderModel as unknown as Model<{ _id: Types.ObjectId; tenantId: Types.ObjectId; doctorId: Types.ObjectId }>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
