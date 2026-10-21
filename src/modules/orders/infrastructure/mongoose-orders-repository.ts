import { type FilterQuery, type Model, type SortOrder, Types } from 'mongoose';

import { InMemorySettingsStore } from '../../settings/infrastructure/settings-store';
import { ClinicModel } from '../../../shared/infrastructure/persistence/mongoose/models/clinic.model';
import { DoctorModel } from '../../../shared/infrastructure/persistence/mongoose/models/doctor.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';
import { SubOrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/sub-order.model';
import { UserModel } from '../../../shared/infrastructure/persistence/mongoose/models/user.model';
import { type Order, type OrderCreationData, type OrderListQuery, type OrderUpdatePayload, type OrderWritePayload } from '../domain/order';
import {
  type DoctorReference,
  type NameReferences,
  type OrderListResult,
  type OrderRepository,
  type PatientReference,
} from '../domain/orders-repository';
import { type SubOrder, type SubOrderUpdatePayload, type SubOrderWritePayload } from '../domain/sub-order';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

const DEFAULT_TENANT_ID = new Types.ObjectId('66f100000000000000000001');
const settingsStore = new InMemorySettingsStore();

const orderSortFields: Record<OrderListQuery['sortBy'], string> = {
  orderNumber: 'orderNumber',
  status: 'status',
  priority: 'priority',
  restoration: 'restoration',
  receivedAt: 'receivedAt',
  dueDate: 'dueDate',
  amount: 'amount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

function orderScopeFilter(scope?: DataVisibilityScope): Record<string, unknown> {
  if (!scope || scope.isAdmin) {
    return {};
  }

  return scope.doctorId
    ? { doctorId: scope.doctorId }
    : { technicianId: scope.userId };
}

export class MongooseOrdersRepository implements OrderRepository {
  public async createOrder(payload: OrderWritePayload): Promise<Order> {
    const created = await orderModel.create({
      ...this.toOrderDocumentPayload(payload),
      tenantId: DEFAULT_TENANT_ID,
    });
    return this.toOrder(created.toObject());
  }

  public async findOrderById(orderId: string, scope?: DataVisibilityScope): Promise<Order | null> {
    const found = await orderModel.findOne({
      _id: orderId,
      tenantId: DEFAULT_TENANT_ID,
      ...orderScopeFilter(scope),
    })
      .lean<OrderRecord | null>()
      .exec();
    return found === null ? null : this.toOrder(found);
  }

  public async listOrders(query: OrderListQuery): Promise<OrderListResult> {
    const filter = await this.buildOrderListFilter(query);
    const sortBy = orderSortFields[query.sortBy];
    const sortValue: SortOrder = query.sortDirection === 'asc' ? 1 : -1;
    const skip = (query.page - 1) * query.pageSize;

    const [items, totalItems] = await Promise.all([
      orderModel.find(filter)
        .sort({ [sortBy]: sortValue })
        .skip(skip)
        .limit(query.pageSize)
        .lean<OrderRecord[]>()
        .exec(),
      orderModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((item) => this.toOrder(item)),
      totalItems,
    };
  }

  public async updateOrder(
    orderId: string,
    payload: OrderUpdatePayload,
    scope?: DataVisibilityScope,
  ): Promise<Order | null> {
    const updated = await orderModel.findOneAndUpdate(
      { _id: orderId, tenantId: DEFAULT_TENANT_ID, ...orderScopeFilter(scope) },
      this.toOrderDocumentPayload(payload),
      { new: true },
    )
      .lean<OrderRecord | null>()
      .exec();

    return updated === null ? null : this.toOrder(updated);
  }

  public async deleteOrder(orderId: string, scope?: DataVisibilityScope): Promise<boolean> {
    const deleted = await orderModel.findOneAndDelete({
      _id: orderId,
      tenantId: DEFAULT_TENANT_ID,
      ...orderScopeFilter(scope),
    }).exec();
    return deleted !== null;
  }

  public async isOrderNumberTaken(orderNumber: string, excludeOrderId?: string): Promise<boolean> {
    const filter: FilterQuery<OrderRecord> = {
      tenantId: DEFAULT_TENANT_ID,
      orderNumber,
      ...(excludeOrderId !== undefined ? { _id: { $ne: new Types.ObjectId(excludeOrderId) } } : {}),
    };
    const found = await orderModel.findOne(filter).select('_id').lean().exec();
    return found !== null;
  }

  public async findPatientById(patientId: string): Promise<PatientReference | null> {
    const record = await patientModel.findOne({
      _id: patientId,
      tenantId: DEFAULT_TENANT_ID,
    })
      .select('_id name doctorId clinicId')
      .lean<PatientReferenceRecord | null>()
      .exec();

    if (record === null) {
      return null;
    }

    return {
      id: record._id.toString(),
      name: record.name,
      doctorId: record.doctorId.toString(),
      clinicId: record.clinicId.toString(),
    };
  }

  public async findDoctorById(doctorId: string): Promise<DoctorReference | null> {
    const record = await doctorModel.findOne({
      _id: doctorId,
      tenantId: DEFAULT_TENANT_ID,
    })
      .select('_id name clinicId')
      .lean<DoctorReferenceRecord | null>()
      .exec();
    if (record === null) {
      return null;
    }

    return {
      id: record._id.toString(),
      name: record.name,
      clinicId: record.clinicId.toString(),
    };
  }

  public async clinicExists(clinicId: string): Promise<boolean> {
    const clinic = await clinicModel.findOne({ _id: clinicId, tenantId: DEFAULT_TENANT_ID })
      .select('_id')
      .lean()
      .exec();
    return clinic !== null;
  }

  public async getNameReferences(orders: Order[]): Promise<NameReferences> {
    const patientIds = uniqueObjectIds(orders.map((order) => order.patientId));
    const doctorIds = uniqueObjectIds(orders.map((order) => order.doctorId));
    const clinicIds = uniqueObjectIds(orders.map((order) => order.clinicId));
    const technicianIds = uniqueObjectIds(
      orders.map((order) => order.technicianId).filter((value): value is string => value !== undefined),
    );

    const [patients, doctors, clinics, technicians] = await Promise.all([
      patientIds.length === 0
        ? Promise.resolve([] as PatientNameRecord[])
        : patientModel.find({ _id: { $in: patientIds }, tenantId: DEFAULT_TENANT_ID })
          .select('_id name')
          .lean<PatientNameRecord[]>()
          .exec(),
      doctorIds.length === 0
        ? Promise.resolve([] as DoctorNameRecord[])
        : doctorModel.find({ _id: { $in: doctorIds }, tenantId: DEFAULT_TENANT_ID })
          .select('_id name')
          .lean<DoctorNameRecord[]>()
          .exec(),
      clinicIds.length === 0
        ? Promise.resolve([] as ClinicNameRecord[])
        : clinicModel.find({ _id: { $in: clinicIds }, tenantId: DEFAULT_TENANT_ID })
          .select('_id name')
          .lean<ClinicNameRecord[]>()
          .exec(),
      technicianIds.length === 0
        ? Promise.resolve([] as TechnicianNameRecord[])
        : userModel.find({ _id: { $in: technicianIds }, tenantId: DEFAULT_TENANT_ID })
          .select('_id fullName')
          .lean<TechnicianNameRecord[]>()
          .exec(),
    ]);

    return {
      patientById: new Map(patients.map((item) => [item._id.toString(), item.name])),
      doctorById: new Map(doctors.map((item) => [item._id.toString(), item.name])),
      clinicById: new Map(clinics.map((item) => [item._id.toString(), item.name])),
      technicianById: new Map(technicians.map((item) => [item._id.toString(), item.fullName])),
    };
  }

  public findScanCenterNameById(scanCenterId: string): string | null {
    const scanCenter = settingsStore.getSnapshot().scanCenters.find((item) => item.id === scanCenterId);
    return scanCenter?.name ?? null;
  }

  public async listSubOrders(orderId: string, _scope?: DataVisibilityScope): Promise<SubOrder[]> {
    const records = await subOrderModel.find({
      tenantId: DEFAULT_TENANT_ID,
      orderId: new Types.ObjectId(orderId),
    })
      .sort({ createdAt: -1 })
      .lean<SubOrderRecord[]>()
      .exec();
    return records.map((record) => this.toSubOrder(record));
  }

  public async findSubOrderById(
    orderId: string,
    subOrderId: string,
    _scope?: DataVisibilityScope,
  ): Promise<SubOrder | null> {
    const record = await subOrderModel.findOne({
      _id: subOrderId,
      tenantId: DEFAULT_TENANT_ID,
      orderId: new Types.ObjectId(orderId),
    })
      .lean<SubOrderRecord | null>()
      .exec();
    return record === null ? null : this.toSubOrder(record);
  }

  public async createSubOrders(
    orderId: string,
    payloads: SubOrderWritePayload[],
    _scope?: DataVisibilityScope,
  ): Promise<SubOrder[]> {
    if (payloads.length === 0) {
      return [];
    }

    const created = await subOrderModel.insertMany(
      payloads.map((payload) => ({
        ...this.toSubOrderDocumentPayload(orderId, payload),
        tenantId: DEFAULT_TENANT_ID,
      })),
      { ordered: true },
    );
    return created.map((item) => this.toSubOrder(item.toObject() as SubOrderRecord));
  }

  public async replaceSubOrders(
    orderId: string,
    payloads: SubOrderWritePayload[],
    scope?: DataVisibilityScope,
  ): Promise<SubOrder[]> {
    await subOrderModel.deleteMany({
      tenantId: DEFAULT_TENANT_ID,
      orderId: new Types.ObjectId(orderId),
    }).exec();

    return this.createSubOrders(orderId, payloads, scope);
  }

  public async updateSubOrder(
    orderId: string,
    subOrderId: string,
    payload: SubOrderUpdatePayload,
    _scope?: DataVisibilityScope,
  ): Promise<SubOrder | null> {
    const update: Record<string, unknown> = {};
    if (payload.service !== undefined) {
      update.service = payload.service;
    }
    if (payload.icon !== undefined) {
      update.icon = payload.icon;
    }
    if (payload.status !== undefined) {
      update.status = payload.status;
    }
    if (payload.formsComplete !== undefined) {
      update.formsComplete = payload.formsComplete;
    }
    if (payload.formsTotal !== undefined) {
      update.formsTotal = payload.formsTotal;
    }
    if (payload.scansComplete !== undefined) {
      update.scansComplete = payload.scansComplete;
    }
    if (payload.scansTotal !== undefined) {
      update.scansTotal = payload.scansTotal;
    }
    if (payload.teeth !== undefined) {
      update.teeth = payload.teeth;
    }
    if (payload.priority !== undefined) {
      update.priority = payload.priority;
    }
    if (payload.dueDate !== undefined) {
      update.dueDate = payload.dueDate;
    }
    if (payload.notes !== undefined) {
      update.notes = payload.notes;
    }
    if (payload.creationData !== undefined) {
      update.creationData = normalizeSubOrderCreationData(payload.creationData);
    }

    const updated = await subOrderModel.findOneAndUpdate(
      {
        _id: subOrderId,
        tenantId: DEFAULT_TENANT_ID,
        orderId: new Types.ObjectId(orderId),
      },
      update,
      { new: true },
    )
      .lean<SubOrderRecord | null>()
      .exec();

    return updated === null ? null : this.toSubOrder(updated);
  }

  public async deleteSubOrder(
    orderId: string,
    subOrderId: string,
    _scope?: DataVisibilityScope,
  ): Promise<boolean> {
    const deleted = await subOrderModel.findOneAndDelete({
      _id: subOrderId,
      tenantId: DEFAULT_TENANT_ID,
      orderId: new Types.ObjectId(orderId),
    }).exec();

    return deleted !== null;
  }

  public async deleteSubOrdersByOrder(orderId: string): Promise<void> {
    await subOrderModel.deleteMany({
      tenantId: DEFAULT_TENANT_ID,
      orderId: new Types.ObjectId(orderId),
    }).exec();
  }

  private async buildOrderListFilter(query: OrderListQuery): Promise<FilterQuery<OrderRecord>> {
    const filter: FilterQuery<OrderRecord> = {
      tenantId: DEFAULT_TENANT_ID,
      ...(query.statuses.length > 0 ? { status: { $in: query.statuses } } : {}),
    };

    if (query.duration !== undefined) {
      filter.receivedAt = buildDurationRange(query.duration);
    }

    if (query.serviceIds.length > 0) {
      const orderIds = await subOrderModel.distinct('orderId', {
        tenantId: DEFAULT_TENANT_ID,
        service: { $in: query.serviceIds },
      }).exec();

      if (orderIds.length === 0) {
        filter._id = { $in: [] as Types.ObjectId[] };
      } else {
        filter._id = { $in: orderIds };
      }
    }

    if (query.search !== undefined) {
      const escapedSearch = escapeRegExp(query.search);
      const searchRegex = new RegExp(escapedSearch, 'i');
      const [patientIds, doctorIds, clinicIds] = await Promise.all([
        patientModel.distinct('_id', { tenantId: DEFAULT_TENANT_ID, name: searchRegex }).exec(),
        doctorModel.distinct('_id', { tenantId: DEFAULT_TENANT_ID, name: searchRegex }).exec(),
        clinicModel.distinct('_id', { tenantId: DEFAULT_TENANT_ID, name: searchRegex }).exec(),
      ]);

      filter.$or = [
        { orderNumber: searchRegex },
        { notes: searchRegex },
        { format: searchRegex },
        { shade: searchRegex },
        ...(patientIds.length > 0 ? [{ patientId: { $in: patientIds } }] : []),
        ...(doctorIds.length > 0 ? [{ doctorId: { $in: doctorIds } }] : []),
        ...(clinicIds.length > 0 ? [{ clinicId: { $in: clinicIds } }] : []),
      ];
    }

    if (query.scope && !query.scope.isAdmin) {
      const ownershipFilter = query.scope.doctorId
        ? { doctorId: query.scope.doctorId }
        : { technicianId: query.scope.userId };
      filter.$and = [...(filter.$and ?? []), ownershipFilter];
    }

    return filter;
  }

  private toOrderDocumentPayload(payload: OrderWritePayload | OrderUpdatePayload): Record<string, unknown> {
    const doc: Record<string, unknown> = {};

    if ('orderNumber' in payload && payload.orderNumber !== undefined) {
      doc.orderNumber = payload.orderNumber;
    }
    if ('patientId' in payload && payload.patientId !== undefined) {
      doc.patientId = new Types.ObjectId(payload.patientId);
    }
    if ('doctorId' in payload && payload.doctorId !== undefined) {
      doc.doctorId = new Types.ObjectId(payload.doctorId);
    }
    if ('clinicId' in payload && payload.clinicId !== undefined) {
      doc.clinicId = new Types.ObjectId(payload.clinicId);
    }
    if ('scanCenterId' in payload && payload.scanCenterId !== undefined) {
      doc.scanCenterId = payload.scanCenterId;
    }
    if ('status' in payload && payload.status !== undefined) {
      doc.status = payload.status;
    }
    if ('priority' in payload && payload.priority !== undefined) {
      doc.priority = payload.priority;
    }
    if ('restoration' in payload && payload.restoration !== undefined) {
      doc.restoration = payload.restoration;
    }
    if ('arch' in payload && payload.arch !== undefined) {
      doc.arch = payload.arch;
    }
    if ('format' in payload && payload.format !== undefined) {
      doc.format = payload.format;
    }
    if ('shade' in payload && payload.shade !== undefined) {
      doc.shade = payload.shade;
    }
    if ('units' in payload && payload.units !== undefined) {
      doc.units = payload.units;
    }
    if ('amount' in payload && payload.amount !== undefined) {
      doc.amount = payload.amount;
    }
    if ('billed' in payload && payload.billed !== undefined) {
      doc.billed = payload.billed;
    }
    if ('billedAmount' in payload && payload.billedAmount !== undefined) {
      doc.billedAmount = payload.billedAmount;
    }
    if ('billTo' in payload && payload.billTo !== undefined) {
      doc.billTo = payload.billTo;
    }
    if ('vouchers' in payload && payload.vouchers !== undefined) {
      doc.vouchers = payload.vouchers;
    }
    if ('isLocked' in payload && payload.isLocked !== undefined) {
      doc.isLocked = payload.isLocked;
    }
    if ('hasNotes' in payload && payload.hasNotes !== undefined) {
      doc.hasNotes = payload.hasNotes;
    }
    if ('notes' in payload && payload.notes !== undefined) {
      doc.notes = payload.notes;
    }
    if ('archiveDate' in payload && payload.archiveDate !== undefined) {
      doc.archiveDate = payload.archiveDate;
    }
    if ('receivedAt' in payload && payload.receivedAt !== undefined) {
      doc.receivedAt = payload.receivedAt;
    }
    if ('sentAt' in payload && payload.sentAt !== undefined) {
      doc.sentAt = payload.sentAt;
    }
    if ('chargedAt' in payload && payload.chargedAt !== undefined) {
      doc.chargedAt = payload.chargedAt;
    }
    if ('dueDate' in payload && payload.dueDate !== undefined) {
      doc.dueDate = payload.dueDate;
    }
    if ('changeRequestId' in payload && payload.changeRequestId !== undefined) {
      doc.changeRequestId = new Types.ObjectId(payload.changeRequestId);
    }
    if ('csTask' in payload && payload.csTask !== undefined) {
      doc.csTask = payload.csTask;
    }
    if ('technicianId' in payload && payload.technicianId !== undefined) {
      doc.technicianId = new Types.ObjectId(payload.technicianId);
    }
    if ('creationData' in payload && payload.creationData !== undefined) {
      doc.creationData = normalizeOrderCreationData(payload.creationData);
    }

    return doc;
  }

  private toSubOrderDocumentPayload(orderId: string, payload: SubOrderWritePayload): Record<string, unknown> {
    return {
      orderId: new Types.ObjectId(orderId),
      service: payload.service,
      icon: payload.icon,
      status: payload.status,
      formsComplete: payload.formsComplete,
      formsTotal: payload.formsTotal,
      scansComplete: payload.scansComplete,
      scansTotal: payload.scansTotal,
      teeth: payload.teeth,
      priority: payload.priority,
      dueDate: payload.dueDate,
      notes: payload.notes,
      ...(payload.creationData !== undefined
        ? { creationData: normalizeSubOrderCreationData(payload.creationData) }
        : {}),
    };
  }

  private toOrder(document: OrderRecord): Order {
    return {
      id: document._id.toString(),
      orderNumber: document.orderNumber,
      patientId: document.patientId.toString(),
      doctorId: document.doctorId.toString(),
      clinicId: document.clinicId.toString(),
      ...(document.scanCenterId !== undefined ? { scanCenterId: document.scanCenterId } : {}),
      status: document.status,
      priority: document.priority,
      restoration: document.restoration,
      arch: document.arch,
      format: document.format,
      shade: document.shade,
      units: document.units,
      amount: document.amount,
      billed: document.billed,
      ...(document.billedAmount !== undefined ? { billedAmount: document.billedAmount } : {}),
      billTo: document.billTo,
      vouchers: document.vouchers,
      isLocked: document.isLocked,
      hasNotes: document.hasNotes,
      notes: document.notes,
      ...(document.archiveDate !== undefined ? { archiveDate: toDate(document.archiveDate) } : {}),
      receivedAt: toDate(document.receivedAt),
      ...(document.sentAt !== undefined ? { sentAt: toDate(document.sentAt) } : {}),
      ...(document.chargedAt !== undefined ? { chargedAt: toDate(document.chargedAt) } : {}),
      dueDate: toDate(document.dueDate),
      ...(document.changeRequestId !== undefined ? { changeRequestId: document.changeRequestId.toString() } : {}),
      ...(document.csTask !== undefined ? { csTask: document.csTask } : {}),
      ...(document.technicianId !== undefined ? { technicianId: document.technicianId.toString() } : {}),
      ...(document.creationData !== undefined ? { creationData: mapOrderCreationData(document.creationData) } : {}),
      createdAt: toDate(document.createdAt),
      updatedAt: toDate(document.updatedAt),
    };
  }

  private toSubOrder(document: SubOrderRecord): SubOrder {
    return {
      id: document._id.toString(),
      orderId: document.orderId.toString(),
      service: document.service,
      icon: document.icon,
      status: document.status,
      formsComplete: document.formsComplete,
      formsTotal: document.formsTotal,
      scansComplete: document.scansComplete,
      scansTotal: document.scansTotal,
      teeth: document.teeth,
      priority: document.priority,
      dueDate: document.dueDate,
      notes: document.notes,
      ...(document.creationData !== undefined
        ? { creationData: normalizeSubOrderCreationData(document.creationData) }
        : {}),
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}

interface OrderRecord {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  orderNumber: string;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  clinicId: Types.ObjectId;
  scanCenterId?: string | undefined;
  status: Order['status'];
  priority: Order['priority'];
  restoration: Order['restoration'];
  arch: Order['arch'];
  format: string;
  shade: string;
  units: number;
  amount: number;
  billed: boolean;
  billedAmount?: number | undefined;
  billTo: string;
  vouchers: number;
  isLocked: boolean;
  hasNotes: boolean;
  notes: string;
  archiveDate?: Date | undefined;
  receivedAt: Date;
  sentAt?: Date | undefined;
  chargedAt?: Date | undefined;
  dueDate: Date;
  changeRequestId?: Types.ObjectId | undefined;
  csTask?: string | undefined;
  technicianId?: Types.ObjectId | undefined;
  creationData?: {
    services: Array<{
      serviceId: string;
      serviceDetails: Record<string, string> | Map<string, string>;
      serviceForm: Record<string, string> | Map<string, string>;
      selectedTeeth: number[];
      scanRequirements: string[];
      fileReferences: string[];
    }>;
    communication?: {
      internalCaseNote: string;
      internalCaseFiles: string[];
      sendMailTo: string[];
      sendIhTaskTo?: string | undefined;
      rushTask: boolean;
    } | undefined;
  } | undefined;
  createdAt: Date;
  updatedAt: Date;
}

interface SubOrderRecord {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  orderId: Types.ObjectId;
  service: string;
  icon: string;
  status: SubOrder['status'];
  formsComplete: number;
  formsTotal: number;
  scansComplete: number;
  scansTotal: number;
  teeth: number[];
  priority: SubOrder['priority'];
  dueDate: Date;
  notes: string;
  creationData?: {
    serviceId: string;
    serviceDetails: Record<string, string> | Map<string, string>;
    serviceForm: Record<string, string> | Map<string, string>;
    selectedTeeth: number[];
    scanRequirements: string[];
    fileReferences: string[];
  } | undefined;
  createdAt: Date;
  updatedAt: Date;
}

interface PatientReferenceRecord {
  _id: Types.ObjectId;
  name: string;
  doctorId: Types.ObjectId;
  clinicId: Types.ObjectId;
}

interface DoctorReferenceRecord {
  _id: Types.ObjectId;
  name: string;
  clinicId: Types.ObjectId;
}

interface PatientNameRecord {
  _id: Types.ObjectId;
  name: string;
}

interface DoctorNameRecord {
  _id: Types.ObjectId;
  name: string;
}

interface ClinicNameRecord {
  _id: Types.ObjectId;
  name: string;
}

interface TechnicianNameRecord {
  _id: Types.ObjectId;
  fullName: string;
}

const orderModel = OrderModel as unknown as Model<OrderRecord>;
const patientModel = PatientModel as unknown as Model<PatientReferenceRecord & PatientNameRecord & { tenantId: Types.ObjectId }>;
const doctorModel = DoctorModel as unknown as Model<DoctorReferenceRecord & DoctorNameRecord & { tenantId: Types.ObjectId }>;
const clinicModel = ClinicModel as unknown as Model<ClinicNameRecord & { tenantId: Types.ObjectId }>;
const subOrderModel = SubOrderModel as unknown as Model<SubOrderRecord>;
const userModel = UserModel as unknown as Model<TechnicianNameRecord & { tenantId: Types.ObjectId }>;

function uniqueObjectIds(ids: string[]): Types.ObjectId[] {
  const unique = new Set(ids);
  return [...unique]
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function buildDurationRange(
  duration: NonNullable<OrderListQuery['duration']>,
): { $gte: Date; $lte: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (duration) {
    case 'today':
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      break;
    case '2-months':
      start.setMonth(start.getMonth() - 2);
      break;
    case '3-months':
      start.setMonth(start.getMonth() - 3);
      break;
    case '6-months':
      start.setMonth(start.getMonth() - 6);
      break;
  }

  return { $gte: start, $lte: now };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapOrderCreationData(input: NonNullable<OrderRecord['creationData']>): OrderCreationData {
  return {
    services: input.services.map((service) => normalizeSubOrderCreationData(service)),
    ...(input.communication !== undefined ? { communication: input.communication } : {}),
  };
}

function normalizeOrderCreationData(input: OrderCreationData): OrderCreationData {
  return {
    services: input.services.map((service) => normalizeSubOrderCreationData(service)),
    ...(input.communication !== undefined ? { communication: input.communication } : {}),
  };
}

function normalizeSubOrderCreationData(input: {
  serviceId: string;
  serviceDetails: Record<string, string> | Map<string, string>;
  serviceForm: Record<string, string> | Map<string, string>;
  selectedTeeth: number[];
  scanRequirements: string[];
  fileReferences: string[];
}): {
  serviceId: string;
  serviceDetails: Record<string, string>;
  serviceForm: Record<string, string>;
  selectedTeeth: number[];
  scanRequirements: string[];
  fileReferences: string[];
} {
  return {
    serviceId: input.serviceId,
    serviceDetails: mapOfStringsToRecord(input.serviceDetails),
    serviceForm: mapOfStringsToRecord(input.serviceForm),
    selectedTeeth: input.selectedTeeth,
    scanRequirements: input.scanRequirements,
    fileReferences: input.fileReferences,
  };
}

function mapOfStringsToRecord(
  value: Record<string, string> | Map<string, string>,
): Record<string, string> {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }

  return value;
}
