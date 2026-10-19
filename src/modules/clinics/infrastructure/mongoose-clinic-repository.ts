import { type FilterQuery, type Model, type SortOrder, Types } from 'mongoose';

import { type Clinic, type ClinicListQuery, type ClinicUpdatePayload, type ClinicWritePayload } from '../domain/clinic';
import { type ClinicListResult, type ClinicRepository } from '../domain/clinic-repository';
import { ClinicModel } from '../../../shared/infrastructure/persistence/mongoose/models/clinic.model';
import { DoctorModel } from '../../../shared/infrastructure/persistence/mongoose/models/doctor.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';

const DEFAULT_TENANT_ID = new Types.ObjectId('66f100000000000000000001');

const clinicSortFields: Record<ClinicListQuery['sortBy'], string> = {
  name: 'name',
  city: 'city',
  status: 'status',
  accountManager: 'accountManager',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export class MongooseClinicRepository implements ClinicRepository {
  public async create(payload: ClinicWritePayload): Promise<Clinic> {
    const created = await clinicModel.create({
      ...payload,
      tenantId: DEFAULT_TENANT_ID,
    });
    return this.toClinicRecord(created.toObject());
  }

  public async findById(clinicId: string): Promise<Clinic | null> {
    const found = await clinicModel.findOne({ _id: clinicId, tenantId: DEFAULT_TENANT_ID })
      .lean<ClinicRecord | null>()
      .exec();
    return found === null ? null : this.toClinicRecord(found);
  }

  public async list(query: ClinicListQuery): Promise<ClinicListResult> {
    const filter: FilterQuery<ClinicRecord> = {
      tenantId: DEFAULT_TENANT_ID,
      ...(query.search !== undefined
        ? {
            $or: [
              { name: new RegExp(escapeRegExp(query.search), 'i') },
              { city: new RegExp(escapeRegExp(query.search), 'i') },
              { accountManager: new RegExp(escapeRegExp(query.search), 'i') },
              { email: new RegExp(escapeRegExp(query.search), 'i') },
            ],
          }
        : {}),
      ...(query.statuses.length > 0 ? { status: { $in: query.statuses } } : {}),
    };

    const sortValue: SortOrder = query.sortDirection === 'asc' ? 1 : -1;
    const sortBy = clinicSortFields[query.sortBy];
    const skip = (query.page - 1) * query.pageSize;

    const [items, totalItems] = await Promise.all([
      clinicModel.find(filter)
        .sort({ [sortBy]: sortValue })
        .skip(skip)
        .limit(query.pageSize)
        .lean<ClinicRecord[]>()
        .exec(),
      clinicModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((item) => this.toClinicRecord(item)),
      totalItems,
    };
  }

  public async update(clinicId: string, payload: ClinicUpdatePayload): Promise<Clinic | null> {
    const updated = await clinicModel.findOneAndUpdate(
      { _id: clinicId, tenantId: DEFAULT_TENANT_ID },
      payload,
      { new: true },
    )
      .lean<ClinicRecord | null>()
      .exec();

    return updated === null ? null : this.toClinicRecord(updated);
  }

  public async delete(clinicId: string): Promise<boolean> {
    const deleted = await clinicModel.findOneAndDelete({
      _id: clinicId,
      tenantId: DEFAULT_TENANT_ID,
    }).exec();

    return deleted !== null;
  }

  public async existsByName(name: string, excludeClinicId?: string): Promise<boolean> {
    const query = {
      tenantId: DEFAULT_TENANT_ID,
      name,
      ...(excludeClinicId !== undefined ? { _id: { $ne: excludeClinicId } } : {}),
    };
    const existing = await clinicModel.findOne(query).select('_id').lean().exec();
    return existing !== null;
  }

  public async hasDoctors(clinicId: string): Promise<boolean> {
    const count = await doctorModel.countDocuments({ tenantId: DEFAULT_TENANT_ID, clinicId }).exec();
    return count > 0;
  }

  public async hasPatients(clinicId: string): Promise<boolean> {
    const count = await patientModel.countDocuments({ tenantId: DEFAULT_TENANT_ID, clinicId }).exec();
    return count > 0;
  }

  public async countDoctors(clinicId: string): Promise<number> {
    return doctorModel.countDocuments({ tenantId: DEFAULT_TENANT_ID, clinicId }).exec();
  }

  public async countPatients(clinicId: string): Promise<number> {
    return patientModel.countDocuments({ tenantId: DEFAULT_TENANT_ID, clinicId }).exec();
  }

  public async countOrders(clinicId: string): Promise<number> {
    return orderModel.countDocuments({ tenantId: DEFAULT_TENANT_ID, clinicId }).exec();
  }

  private toClinicRecord(document: ClinicRecord): Clinic {
    return {
      id: document._id.toString(),
      name: document.name,
      address: document.address,
      city: document.city,
      phone: document.phone,
      email: document.email,
      status: document.status,
      accountManager: document.accountManager,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}

interface ClinicRecord {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  status: Clinic['status'];
  accountManager: string;
  createdAt: Date;
  updatedAt: Date;
}

const clinicModel = ClinicModel as unknown as Model<ClinicRecord>;
const doctorModel = DoctorModel as unknown as Model<{ _id: Types.ObjectId; tenantId: Types.ObjectId; clinicId: Types.ObjectId }>;
const patientModel = PatientModel as unknown as Model<{ _id: Types.ObjectId; tenantId: Types.ObjectId; clinicId: Types.ObjectId }>;
const orderModel = OrderModel as unknown as Model<{ _id: Types.ObjectId; tenantId: Types.ObjectId; clinicId: Types.ObjectId }>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
