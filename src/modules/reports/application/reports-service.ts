import { Types } from 'mongoose';

import { buildPaginationMeta, type PaginationQuery } from '../../../shared/application/contracts/pagination';
import { BillingRecordModel } from '../../../shared/infrastructure/persistence/mongoose/models/billing-record.model';
import { DoctorModel } from '../../../shared/infrastructure/persistence/mongoose/models/doctor.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';
import { UserModel } from '../../../shared/infrastructure/persistence/mongoose/models/user.model';
import { InMemorySettingsStore } from '../../settings/infrastructure/settings-store';

interface OrderProjection {
  _id: Types.ObjectId;
  orderNumber: string;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  clinicId: Types.ObjectId;
  scanCenterId?: Types.ObjectId;
  restoration: string;
  arch: string;
  amount: number;
  vouchers: number;
  receivedAt: Date;
  sentAt?: Date;
  archiveDate?: Date;
  chargedAt?: Date;
  status: string;
  technicianId?: Types.ObjectId;
}

const settingsStore = new InMemorySettingsStore();

export async function getDashboardVolume(tenantId?: Types.ObjectId): Promise<{
  weeks: Array<{ week: string; orders: number; completed: number }>;
}> {
  const now = new Date();
  const weekRanges = buildWeekRanges(now, 8);
  const filter = tenantId ? { tenantId } : {};

  const orders: Array<{ receivedAt: Date; status: string }> = await OrderModel.find(filter)
    .select({ receivedAt: 1, status: 1 })
    .lean<Array<{ receivedAt: Date; status: string }>>()
    .exec();

  const weeks = weekRanges.map((range) => ({
    week: range.label,
    orders: 0,
    completed: 0,
  }));

  for (const order of orders) {
    const index = weekRanges.findIndex((range) => order.receivedAt >= range.start && order.receivedAt < range.end);
    if (index < 0) {
      continue;
    }

    const week = weeks[index];
    if (!week) {
      continue;
    }

    week.orders += 1;
    if (order.status === 'Completed') {
      week.completed += 1;
    }
  }

  return { weeks };
}

export async function getReportsOverview(tenantId?: Types.ObjectId): Promise<{
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  restorationBreakdown: Array<{ name: string; value: number }>;
  turnaround: Array<{ day: string; days: number }>;
  workflowShare: Array<{ stage: string; count: number; percent: number }>;
}> {
  const filter = tenantId ? { tenantId } : {};
  const [orders, billingRecords]: [
    Array<{ restoration: string; status: string; receivedAt: Date; sentAt?: Date }>,
    Array<{ amount: number; invoiceDate?: Date; dueDate: Date }>,
  ] = await Promise.all([
    OrderModel.find(filter)
      .select({ restoration: 1, status: 1, receivedAt: 1, sentAt: 1 })
      .lean<Array<{ restoration: string; status: string; receivedAt: Date; sentAt?: Date }>>()
      .exec(),
    BillingRecordModel.find(filter)
      .select({ amount: 1, invoiceDate: 1, dueDate: 1 })
      .lean<Array<{ amount: number; invoiceDate?: Date; dueDate: Date }>>()
      .exec(),
  ]);

  const monthlyRevenue = calculateMonthlyRevenue(billingRecords, 6);
  const restorationBreakdown = countByField(orders, (item) => item.restoration)
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value);
  const workflowShareBase = countByField(orders, (item) => item.status);
  const totalOrders = orders.length || 1;
  const workflowShare = workflowShareBase
    .map(([stage, count]) => ({
      stage,
      count,
      percent: Number(((count / totalOrders) * 100).toFixed(1)),
    }))
    .sort((left, right) => right.count - left.count);
  const turnaround = buildTurnaroundSeries(orders);

  return {
    monthlyRevenue,
    restorationBreakdown,
    turnaround,
    workflowShare,
  };
}

export async function getOrdersRangeReport(input: {
  pagination: PaginationQuery;
  from?: Date | undefined;
  to?: Date | undefined;
  search?: string | undefined;
  sortBy: 'receivedAt' | 'sentAt' | 'amount' | 'archiveDate' | 'chargedAt' | 'orderNumber';
  sortDirection: 'asc' | 'desc';
  tenantId?: Types.ObjectId | undefined;
}): Promise<{
  items: Array<{
    id: string;
    orderId: string;
    scanCenter: string;
    doctorName: string;
    patientName: string;
    serviceName: string;
    maxillary: boolean;
    mandibular: boolean;
    amount: number;
    vouchers: number;
    receivedAt: string;
    sentAt: string;
    operator: string;
    archiveDate: string;
    chargedAt: string | null;
  }>;
  totalItems: number;
}> {
  const filter: Record<string, unknown> = input.tenantId ? { tenantId: input.tenantId } : {};
  if (input.from || input.to) {
    filter.receivedAt = {};
    if (input.from) {
      (filter.receivedAt as { $gte?: Date }).$gte = input.from;
    }
    if (input.to) {
      (filter.receivedAt as { $lte?: Date }).$lte = input.to;
    }
  }

  const sortDirection = input.sortDirection === 'asc' ? 1 : -1;
  const records: OrderProjection[] = await OrderModel.find(filter)
    .select({
      _id: 1,
      orderNumber: 1,
      patientId: 1,
      doctorId: 1,
      scanCenterId: 1,
      restoration: 1,
      arch: 1,
      amount: 1,
      vouchers: 1,
      receivedAt: 1,
      sentAt: 1,
      archiveDate: 1,
      chargedAt: 1,
    })
    .sort({ [input.sortBy]: sortDirection })
    .lean<OrderProjection[]>()
    .exec();

  const settingsSnapshot = settingsStore.getSnapshot();
  const scanCenterMap = new Map(
    settingsSnapshot.scanCenters.map((scanCenter) => [scanCenter.id, scanCenter]),
  );
  const patientMap = await buildNameMap(PatientModel, records.map((record) => record.patientId), 'name');
  const doctorMap = await buildNameMap(DoctorModel, records.map((record) => record.doctorId), 'name');

  let items = records.map((record) => {
    const scanCenterKey = record.scanCenterId?.toString();
    const scanCenter = scanCenterKey ? scanCenterMap.get(scanCenterKey) : undefined;
    const receivedAtIso = record.receivedAt.toISOString();
    const sentAtIso = record.sentAt?.toISOString() ?? receivedAtIso;
    const archiveDateIso = record.archiveDate?.toISOString() ?? receivedAtIso;

    return {
      id: record._id.toString(),
      orderId: record._id.toString(),
      scanCenter: scanCenter?.name ?? 'Unassigned',
      doctorName: doctorMap.get(record.doctorId.toString()) ?? '',
      patientName: patientMap.get(record.patientId.toString()) ?? '',
      serviceName: record.restoration,
      maxillary: record.arch === 'Maxilla' || record.arch === 'Both',
      mandibular: record.arch === 'Mandible' || record.arch === 'Both',
      amount: record.amount,
      vouchers: record.vouchers,
      receivedAt: receivedAtIso,
      sentAt: sentAtIso,
      operator: scanCenter?.operator ?? 'N/A',
      archiveDate: archiveDateIso,
      chargedAt: record.chargedAt ? record.chargedAt.toISOString() : null,
    };
  });

  if (input.search) {
    const normalized = input.search.toLowerCase();
    items = items.filter((item) =>
      [item.orderId, item.scanCenter, item.doctorName, item.patientName, item.serviceName]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }

  const totalItems = items.length;
  const startIndex = (input.pagination.page - 1) * input.pagination.pageSize;
  items = items.slice(startIndex, startIndex + input.pagination.pageSize);

  return {
    items,
    totalItems,
  };
}

export function getQuarterlyTargets(year: number, quarter?: 1 | 2 | 3 | 4): {
  year: number;
  quarters: Array<{
    quarter: 1 | 2 | 3 | 4;
    targetRevenue: number;
    achievedRevenue: number;
    ordersTarget: number;
    ordersCompleted: number;
    completionRate: number;
  }>;
} {
  const records = settingsStore
    .getSnapshot()
    .quarterlyTargets.filter((item) => item.year === year && (quarter ? item.quarter === quarter : true))
    .sort((left, right) => left.quarter - right.quarter);

  return {
    year,
    quarters: records.map((record) => ({
      quarter: record.quarter,
      targetRevenue: record.targetRevenue,
      achievedRevenue: record.achievedRevenue,
      ordersTarget: record.ordersTarget,
      ordersCompleted: record.ordersCompleted,
      completionRate: Number(((record.ordersCompleted / Math.max(1, record.ordersTarget)) * 100).toFixed(1)),
    })),
  };
}

export async function getTeamPerformance(tenantId?: Types.ObjectId): Promise<{
  records: Array<{
    userId: number;
    type: string;
    fullName: string;
    completedOrders: number;
    revenueCollected: number;
    avgTurnaroundDays: number;
    onTimeRate: number;
    status: 'Active' | 'On Leave';
  }>;
}> {
  const baseMembers = settingsStore.getSnapshot().teamMembers;
  const filter = tenantId ? { tenantId } : {};
  const orders: Array<{
    technicianId?: Types.ObjectId;
    status: string;
    amount: number;
    dueDate: Date;
    sentAt?: Date;
    receivedAt: Date;
  }> = await OrderModel.find(filter)
    .select({ technicianId: 1, status: 1, amount: 1, dueDate: 1, sentAt: 1, receivedAt: 1 })
    .lean<Array<{ technicianId?: Types.ObjectId; status: string; amount: number; dueDate: Date; sentAt?: Date; receivedAt: Date }>>()
    .exec();

  const userMap = await buildNameMap(UserModel, orders.map((order) => order.technicianId).filter(Boolean) as Types.ObjectId[], 'fullName');
  const byTechnician = new Map<
    string,
    { completedOrders: number; revenueCollected: number; onTimeCompleted: number; totalWithSentAt: number; totalTurnaround: number }
  >();

  for (const order of orders) {
    const technicianId = order.technicianId?.toString();
    if (!technicianId) {
      continue;
    }

    const aggregate = byTechnician.get(technicianId) ?? {
      completedOrders: 0,
      revenueCollected: 0,
      onTimeCompleted: 0,
      totalWithSentAt: 0,
      totalTurnaround: 0,
    };

    if (order.status === 'Completed') {
      aggregate.completedOrders += 1;
      aggregate.revenueCollected += order.amount;
    }

    if (order.sentAt) {
      aggregate.totalWithSentAt += 1;
      aggregate.totalTurnaround += Math.max(
        0,
        (order.sentAt.getTime() - order.receivedAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (order.sentAt <= order.dueDate) {
        aggregate.onTimeCompleted += 1;
      }
    }

    byTechnician.set(technicianId, aggregate);
  }

  const technicianMetrics = [...byTechnician.entries()].map(([technicianId, aggregate]) => ({
    technicianId,
    aggregate,
    fullName: userMap.get(technicianId),
  }));

  const records = baseMembers.map((member, index) => {
    const metrics = technicianMetrics[index];
    const aggregate = metrics?.aggregate;

    return {
      userId: member.userId,
      type: member.type,
      fullName: metrics?.fullName ?? member.fullName,
      completedOrders: aggregate?.completedOrders ?? 0,
      revenueCollected: aggregate ? Number(aggregate.revenueCollected.toFixed(2)) : 0,
      avgTurnaroundDays: aggregate
        ? Number((aggregate.totalTurnaround / Math.max(1, aggregate.totalWithSentAt)).toFixed(2))
        : 0,
      onTimeRate: aggregate
        ? Number(((aggregate.onTimeCompleted / Math.max(1, aggregate.totalWithSentAt)) * 100).toFixed(1))
        : 0,
      status: member.status,
    };
  });

  return { records };
}

export async function getReportingSeedData(tenantId?: Types.ObjectId): Promise<{
  startYear: number;
  endYear: number;
  services: Array<{ key: string; label: string; basePrice: number }>;
  scanCenters: string[];
  doctors: string[];
  patientsFirstNames: string[];
  patientsLastNames: string[];
  operators: string[];
  employeeTypes: string[];
  employeeNames: string[];
}> {
  const filter = tenantId ? { tenantId } : {};
  const [orders, doctors, patients] = await Promise.all([
    OrderModel.find(filter)
      .select({ restoration: 1, amount: 1, receivedAt: 1 })
      .lean<Array<{ restoration: string; amount: number; receivedAt: Date }>>()
      .exec(),
    DoctorModel.find(filter).select({ name: 1 }).lean<Array<{ name: string }>>().exec(),
    PatientModel.find(filter).select({ name: 1 }).lean<Array<{ name: string }>>().exec(),
  ]);

  const nowYear = new Date().getUTCFullYear();
  const years = orders
    .map((order) => order.receivedAt?.getUTCFullYear?.())
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const startYear = years.length > 0 ? Math.min(...years) : nowYear;
  const endYear = years.length > 0 ? Math.max(...years) : nowYear;

  const serviceTotals = new Map<string, { label: string; count: number; totalAmount: number }>();
  for (const order of orders) {
    const label = order.restoration?.trim();
    if (!label) {
      continue;
    }
    const current = serviceTotals.get(label);
    if (current) {
      current.count += 1;
      current.totalAmount += Number(order.amount) || 0;
    } else {
      serviceTotals.set(label, {
        label,
        count: 1,
        totalAmount: Number(order.amount) || 0,
      });
    }
  }

  const services = [...serviceTotals.values()].map((service) => ({
    key: toServiceKey(service.label),
    label: service.label,
    basePrice: Math.round(service.totalAmount / Math.max(1, service.count)),
  }));

  const settingsSnapshot = settingsStore.getSnapshot();
  const scanCenters = settingsSnapshot.scanCenters.map((scanCenter) => scanCenter.name);
  const operators = settingsSnapshot.scanCenters.map((scanCenter) => scanCenter.operator);
  const employeeTypes = [...new Set(settingsSnapshot.teamMembers.map((member) => member.type))];
  const employeeNames = settingsSnapshot.teamMembers.map((member) => member.fullName);

  const doctorNames = doctors
    .map((doctor) => doctor.name?.trim())
    .filter((name): name is string => Boolean(name));

  const patientNameParts = patients
    .map((patient) => splitName(patient.name))
    .filter((parts): parts is { firstName: string; lastName: string } => parts !== null);

  const patientsFirstNames = patientNameParts.map((parts) => parts.firstName);
  const patientsLastNames = patientNameParts.map((parts) => parts.lastName);

  return {
    startYear,
    endYear,
    services,
    scanCenters,
    doctors: doctorNames,
    patientsFirstNames,
    patientsLastNames,
    operators,
    employeeTypes,
    employeeNames,
  };
}

export { buildPaginationMeta };

function toServiceKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitName(fullName: string | undefined): { firstName: string; lastName: string } | null {
  const normalized = fullName?.trim();
  if (!normalized) {
    return null;
  }
  const parts = normalized.split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ') || parts[0] || '';
  if (!firstName || !lastName) {
    return null;
  }
  return { firstName, lastName };
}

function calculateMonthlyRevenue(
  records: Array<{ amount: number; invoiceDate?: Date; dueDate: Date }>,
  monthCount: number,
): Array<{ month: string; revenue: number }> {
  const now = new Date();
  const monthKeys: string[] = [];
  for (let index = monthCount - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    monthKeys.push(`${date.getFullYear()}-${date.getMonth()}`);
  }

  const revenueByMonth = new Map(monthKeys.map((key) => [key, 0]));
  for (const record of records) {
    const sourceDate = record.invoiceDate ?? record.dueDate;
    const key = `${sourceDate.getFullYear()}-${sourceDate.getMonth()}`;
    if (!revenueByMonth.has(key)) {
      continue;
    }

    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + record.amount);
  }

  return monthKeys.map((key) => {
    const [yearText, monthText] = key.split('-');
    const labelDate = new Date(Number(yearText), Number(monthText), 1);
    return {
      month: labelDate.toLocaleString('en-US', { month: 'short' }),
      revenue: Number((revenueByMonth.get(key) ?? 0).toFixed(2)),
    };
  });
}

function countByField<TItem>(items: TItem[], selector: (item: TItem) => string): Array<[string, number]> {
  const buckets = new Map<string, number>();
  for (const item of items) {
    const key = selector(item);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()];
}

function buildTurnaroundSeries(
  orders: Array<{ status: string; receivedAt: Date; sentAt?: Date }>,
): Array<{ day: string; days: number }> {
  const dayBuckets = new Map<number, { count: number; totalDays: number }>();
  for (let day = 0; day < 7; day += 1) {
    dayBuckets.set(day, { count: 0, totalDays: 0 });
  }

  for (const order of orders) {
    if (order.status !== 'Completed' || !order.sentAt) {
      continue;
    }

    const day = order.sentAt.getUTCDay();
    const bucket = dayBuckets.get(day);
    if (!bucket) {
      continue;
    }

    bucket.count += 1;
    bucket.totalDays += Math.max(
      0,
      (order.sentAt.getTime() - order.receivedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return dayNames.map((dayName, index) => {
    const bucket = dayBuckets.get(index);
    if (!bucket || bucket.count === 0) {
      return {
        day: dayName,
        days: 0,
      };
    }

    return {
      day: dayName,
      days: Number((bucket.totalDays / bucket.count).toFixed(2)),
    };
  });
}

function buildWeekRanges(
  endDate: Date,
  weeks: number,
): Array<{ label: string; start: Date; end: Date }> {
  const ranges: Array<{ label: string; start: Date; end: Date }> = [];
  const cursor = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const rangeStart = new Date(cursor);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - offset * 7 - rangeStart.getUTCDay());

    const rangeEnd = new Date(rangeStart);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);

    ranges.push({
      label: `${rangeStart.getUTCFullYear()}-W${formatWeekNumber(rangeStart)}`,
      start: rangeStart,
      end: rangeEnd,
    });
  }

  return ranges;
}

function formatWeekNumber(date: Date): string {
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const passedDays = Math.floor((date.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24));
  const weekNumber = Math.ceil((passedDays + firstDay.getUTCDay() + 1) / 7);
  return String(weekNumber).padStart(2, '0');
}

async function buildNameMap(
  model: {
    find(filter: Record<string, unknown>): {
      select(selection: Record<string, 1>): {
        lean<TLean>(): { exec(): Promise<TLean> };
      };
    };
  },
  ids: Types.ObjectId[],
  field: string,
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.map((id) => id.toString()))].map(
    (id) => new Types.ObjectId(id),
  );

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const records: Array<{ _id: Types.ObjectId } & Record<string, string>> = await model
    .find({ _id: { $in: uniqueIds } })
    .select({ _id: 1, [field]: 1 })
    .lean<Array<{ _id: Types.ObjectId } & Record<string, string>>>()
    .exec();

  return new Map(records.map((record) => [record._id.toString(), record[field] ?? '']));
}
