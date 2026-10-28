import type { PipelineStage, Types } from 'mongoose';

import { buildPaginationMeta, type PaginationQuery } from '../../../shared/application/contracts/pagination';
import { BillingRecordModel } from '../../../shared/infrastructure/persistence/mongoose/models/billing-record.model';
import { DoctorModel } from '../../../shared/infrastructure/persistence/mongoose/models/doctor.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';
import { ScanCenterModel } from '../../../shared/infrastructure/persistence/mongoose/models/scan-center.model';
import { SubOrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/sub-order.model';
import { UserModel } from '../../../shared/infrastructure/persistence/mongoose/models/user.model';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

interface OrdersRangeAggregationRecord {
  _id: Types.ObjectId;
  orderNumber: string;
  scanCenterName: string;
  doctorName: string;
  patientName: string;
  restoration: string;
  arch: string;
  amount: number;
  vouchers: number;
  receivedAt: Date;
  sentAt?: Date;
  archiveDate?: Date;
  chargedAt?: Date;
  operatorName: string;
}

export async function getDashboardVolume(
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Promise<{
  weeks: Array<{ week: string; orders: number; completed: number }>;
}> {
  const now = new Date();
  const weekRanges = buildWeekRanges(now, 8);
  const filter = buildScopedFilter(tenantId, scope);

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

export async function getReportsOverview(
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Promise<{
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  restorationBreakdown: Array<{ name: string; value: number }>;
  turnaround: Array<{ day: string; days: number }>;
  workflowShare: Array<{ stage: string; count: number; percent: number }>;
}> {
  const filter = buildScopedFilter(tenantId, scope);
  const monthRange = buildRecentMonthRange(6);
  const [ordersSummary, monthlyRevenueRecords] = await Promise.all([
    OrderModel.aggregate<{
      restorationBreakdown: Array<{ _id: string; value: number }>;
      workflowShare: Array<{ _id: string; count: number }>;
      turnaround: Array<{ _id: number; days: number }>;
      totalOrders: Array<{ count: number }>;
    }>([
      { $match: filter },
      {
        $facet: {
          restorationBreakdown: [
            { $group: { _id: '$restoration', value: { $sum: 1 } } },
            { $sort: { value: -1, _id: 1 } },
          ],
          workflowShare: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
          ],
          totalOrders: [{ $count: 'count' }],
          turnaround: [
            { $match: { status: 'Completed', sentAt: { $type: 'date' }, receivedAt: { $type: 'date' } } },
            {
              $project: {
                sentDay: { $dayOfWeek: '$sentAt' },
                turnaroundDays: {
                  $cond: [
                    { $gte: [{ $subtract: ['$sentAt', '$receivedAt'] }, 0] },
                    { $divide: [{ $subtract: ['$sentAt', '$receivedAt'] }, 1000 * 60 * 60 * 24] },
                    0,
                  ],
                },
              },
            },
            { $group: { _id: '$sentDay', days: { $avg: '$turnaroundDays' } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]).exec(),
    BillingRecordModel.aggregate<{ _id: { year: number; month: number }; revenue: number }>([
      { $match: filter },
      { $project: { amount: 1, sourceDate: { $ifNull: ['$invoiceDate', '$dueDate'] } } },
      { $match: { sourceDate: { $gte: monthRange.start, $lt: monthRange.end } } },
      {
        $group: {
          _id: { year: { $year: '$sourceDate' }, month: { $month: '$sourceDate' } },
          revenue: { $sum: '$amount' },
        },
      },
    ]).exec(),
  ]);

  const summary = ordersSummary[0] ?? {
    restorationBreakdown: [],
    workflowShare: [],
    turnaround: [],
    totalOrders: [],
  };
  const monthlyRevenue = mapMonthlyRevenueSeries(monthlyRevenueRecords, monthRange.keys);
  const restorationBreakdown = summary.restorationBreakdown.map((item) => ({
    name: item._id,
    value: item.value,
  }));
  const totalOrders = summary.totalOrders[0]?.count ?? 0;
  const denominator = totalOrders > 0 ? totalOrders : 1;
  const workflowShare = summary.workflowShare.map((item) => ({
    stage: item._id,
    count: item.count,
    percent: Number(((item.count / denominator) * 100).toFixed(1)),
  }));
  const turnaround = buildTurnaroundSeriesFromAggregation(summary.turnaround);

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
  scope?: DataVisibilityScope | undefined;
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
  const filter: Record<string, unknown> = buildScopedFilter(input.tenantId, input.scope);
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
  const skip = (input.pagination.page - 1) * input.pagination.pageSize;
  const aggregationPipeline: PipelineStage[] = [
    { $match: filter },
    { $lookup: { from: 'patients', localField: 'patientId', foreignField: '_id', as: 'patient' } },
    { $lookup: { from: 'doctors', localField: 'doctorId', foreignField: '_id', as: 'doctor' } },
    { $lookup: { from: 'scan_centers', localField: 'scanCenterId', foreignField: 'externalId', as: 'scanCenter' } },
    {
      $addFields: {
        patientName: { $ifNull: [{ $arrayElemAt: ['$patient.name', 0] }, ''] },
        doctorName: { $ifNull: [{ $arrayElemAt: ['$doctor.name', 0] }, ''] },
        scanCenterName: { $ifNull: [{ $arrayElemAt: ['$scanCenter.name', 0] }, 'Unassigned'] },
        operatorName: { $ifNull: [{ $arrayElemAt: ['$scanCenter.operator', 0] }, 'N/A'] },
      },
    },
  ];

  if (input.search && input.search.trim().length > 0) {
    const searchRegex = new RegExp(escapeRegExp(input.search.trim()), 'i');
    aggregationPipeline.push({
      $match: {
        $or: [
          { orderNumber: searchRegex },
          { patientName: searchRegex },
          { doctorName: searchRegex },
          { scanCenterName: searchRegex },
          { restoration: searchRegex },
        ],
      },
    });
  }

  aggregationPipeline.push({
    $facet: {
      metadata: [{ $count: 'totalItems' }],
      items: [
        { $sort: { [input.sortBy]: sortDirection, _id: 1 } },
        { $skip: skip },
        { $limit: input.pagination.pageSize },
        {
          $project: {
            _id: 1,
            orderNumber: 1,
            scanCenterName: 1,
            doctorName: 1,
            patientName: 1,
            restoration: 1,
            arch: 1,
            amount: 1,
            vouchers: 1,
            receivedAt: 1,
            sentAt: 1,
            archiveDate: 1,
            chargedAt: 1,
            operatorName: 1,
          },
        },
      ],
    },
  });

  const aggregated = await OrderModel.aggregate<{
    metadata: Array<{ totalItems: number }>;
    items: OrdersRangeAggregationRecord[];
  }>(aggregationPipeline).exec();
  const result = aggregated[0];
  const totalItems = result?.metadata?.[0]?.totalItems ?? 0;
  const items = (result?.items ?? []).map((record) => {
    const receivedAt = toDate(record.receivedAt);
    const sentAt = record.sentAt ? toDate(record.sentAt) : receivedAt;
    const archiveDate = record.archiveDate ? toDate(record.archiveDate) : receivedAt;

    return {
      id: record._id.toString(),
      orderId: record._id.toString(),
      scanCenter: record.scanCenterName || 'Unassigned',
      doctorName: record.doctorName || '',
      patientName: record.patientName || '',
      serviceName: record.restoration,
      maxillary: record.arch === 'Maxilla' || record.arch === 'Both',
      mandibular: record.arch === 'Mandible' || record.arch === 'Both',
      amount: record.amount,
      vouchers: record.vouchers,
      receivedAt: receivedAt.toISOString(),
      sentAt: sentAt.toISOString(),
      operator: record.operatorName || 'N/A',
      archiveDate: archiveDate.toISOString(),
      chargedAt: record.chargedAt ? toDate(record.chargedAt).toISOString() : null,
    };
  });

  return {
    items,
    totalItems,
  };
}

export async function getQuarterlyTargets(
  year: number,
  quarter?: 1 | 2 | 3 | 4,
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Promise<{
  year: number;
  quarters: Array<{
    quarter: 1 | 2 | 3 | 4;
    targetRevenue: number;
    achievedRevenue: number;
    ordersTarget: number;
    ordersCompleted: number;
    completionRate: number;
  }>;
}> {
  const filter = buildScopedFilter(tenantId, scope);
  const [orders, billingRecords] = await Promise.all([
    OrderModel.find({
      ...filter,
      receivedAt: {
        $gte: new Date(Date.UTC(year, 0, 1)),
        $lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    })
      .select({ receivedAt: 1, status: 1 })
      .lean<Array<{ receivedAt: Date; status: string }>>()
      .exec(),
    BillingRecordModel.find({
      ...filter,
      $or: [
        {
          invoiceDate: {
            $gte: new Date(Date.UTC(year, 0, 1)),
            $lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
        },
        {
          invoiceDate: { $exists: false },
          dueDate: {
            $gte: new Date(Date.UTC(year, 0, 1)),
            $lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
        },
      ],
    })
      .select({ amount: 1, invoiceDate: 1, dueDate: 1 })
      .lean<Array<{ amount: number; invoiceDate?: Date; dueDate: Date }>>()
      .exec(),
  ]);
  const records = [1, 2, 3, 4]
    .map((quarterNumber) => {
      const quarterStartMonth = (quarterNumber - 1) * 3;
      const start = new Date(Date.UTC(year, quarterStartMonth, 1));
      const end = new Date(Date.UTC(year, quarterStartMonth + 3, 1));
      const quarterOrders = orders.filter(
        (order) => order.receivedAt >= start && order.receivedAt < end,
      );
      const revenue = billingRecords
        .filter((record) => {
          const sourceDate = record.invoiceDate ?? record.dueDate;
          return sourceDate >= start && sourceDate < end;
        })
        .reduce((total, record) => total + (Number(record.amount) || 0), 0);
      return {
        quarter: quarterNumber as 1 | 2 | 3 | 4,
        targetRevenue: 0,
        achievedRevenue: Number(revenue.toFixed(2)),
        ordersTarget: 0,
        ordersCompleted: quarterOrders.filter((order) => order.status === 'Completed').length,
      };
    })
    .filter((record) => quarter === undefined || record.quarter === quarter);

  return {
    year,
    quarters: records.map((record) => ({
      quarter: record.quarter,
      targetRevenue: record.targetRevenue,
      achievedRevenue: record.achievedRevenue,
      ordersTarget: record.ordersTarget,
      ordersCompleted: record.ordersCompleted,
      completionRate: record.ordersTarget === 0
        ? 0
        : Number(((record.ordersCompleted / record.ordersTarget) * 100).toFixed(1)),
    })),
  };
}

export async function getTeamPerformance(
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Promise<{
  records: Array<{
    userId: string;
    type: string;
    fullName: string;
    completedOrders: number;
    revenueCollected: number;
    avgTurnaroundDays: number;
    onTimeRate: number;
    status: 'Active' | 'On Leave';
  }>;
}> {
  const filter = buildScopedFilter(tenantId, scope);
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

  const technicianIds = orders
    .map((order) => order.technicianId)
    .filter((value): value is Types.ObjectId => value !== undefined);
  const technicians = await UserModel.find({
    ...(tenantId ? { tenantId } : {}),
    _id: { $in: technicianIds },
  })
    .select({ _id: 1, fullName: 1, roles: 1, status: 1 })
    .lean<Array<{ _id: Types.ObjectId; fullName: string; roles: string[]; status: string }>>()
    .exec();
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

  const records = technicians.map((member): {
    userId: string;
    type: string;
    fullName: string;
    completedOrders: number;
    revenueCollected: number;
    avgTurnaroundDays: number;
    onTimeRate: number;
    status: 'Active' | 'On Leave';
  } => {
    const metrics = byTechnician.get(member._id.toString());
    const aggregate = metrics;

    return {
      userId: member._id.toString(),
      type: member.roles[0] ?? 'technician',
      fullName: member.fullName,
      completedOrders: aggregate?.completedOrders ?? 0,
      revenueCollected: aggregate ? Number(aggregate.revenueCollected.toFixed(2)) : 0,
      avgTurnaroundDays: aggregate
        ? Number((aggregate.totalTurnaround / Math.max(1, aggregate.totalWithSentAt)).toFixed(2))
        : 0,
      onTimeRate: aggregate
        ? Number(((aggregate.onTimeCompleted / Math.max(1, aggregate.totalWithSentAt)) * 100).toFixed(1))
        : 0,
      status: member.status === 'active' ? 'Active' : 'On Leave',
    };
  });

  return { records };
}

export async function getSubOrderReport(input: {
  from?: Date | undefined;
  to?: Date | undefined;
  statuses?: Array<'done' | 'in-progress' | 'pending' | 'blocked'> | undefined;
  service?: string | undefined;
  tenantId?: Types.ObjectId;
  scope?: DataVisibilityScope;
}): Promise<{
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    blocked: number;
    overdue: number;
    completionRate: number;
  };
  byService: Array<{
    service: string;
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    blocked: number;
    overdue: number;
    completionRate: number;
  }>;
  byPriority: Array<{
    priority: string;
    total: number;
    completed: number;
    overdue: number;
  }>;
}> {
  const orderFilter = buildScopedFilter(input.tenantId, input.scope);
  const orders = await OrderModel.find(orderFilter)
    .select({ _id: 1 })
    .lean<Array<{ _id: Types.ObjectId }>>()
    .exec();
  const subOrderFilter: Record<string, unknown> = {
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    orderId: { $in: orders.map((order) => order._id) },
  };

  if (input.from !== undefined || input.to !== undefined) {
    subOrderFilter.dueDate = {
      ...(input.from !== undefined ? { $gte: input.from } : {}),
      ...(input.to !== undefined ? { $lte: input.to } : {}),
    };
  }
  if (input.statuses !== undefined && input.statuses.length > 0) {
    subOrderFilter.status = { $in: input.statuses };
  }
  if (input.service !== undefined && input.service.trim().length > 0) {
    subOrderFilter.service = new RegExp(escapeRegExp(input.service.trim()), 'i');
  }

  const records = await SubOrderModel.find(subOrderFilter)
    .select({ service: 1, status: 1, priority: 1, dueDate: 1 })
    .lean<Array<{
      service: string;
      status: 'done' | 'in-progress' | 'pending' | 'blocked';
      priority: string;
      dueDate: Date;
    }>>()
    .exec();
  const now = new Date();
  const isOverdue = (record: { status: string; dueDate: Date }) =>
    record.status !== 'done' && record.dueDate < now;

  const summary = {
    total: records.length,
    completed: records.filter((record) => record.status === 'done').length,
    inProgress: records.filter((record) => record.status === 'in-progress').length,
    pending: records.filter((record) => record.status === 'pending').length,
    blocked: records.filter((record) => record.status === 'blocked').length,
    overdue: records.filter(isOverdue).length,
    completionRate: 0,
  };
  summary.completionRate = summary.total === 0
    ? 0
    : Number(((summary.completed / summary.total) * 100).toFixed(1));

  const serviceGroups = new Map<string, typeof summary & { service: string }>();
  const priorityGroups = new Map<string, { priority: string; total: number; completed: number; overdue: number }>();
  for (const record of records) {
    const serviceGroup = serviceGroups.get(record.service) ?? {
      service: record.service,
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0,
      blocked: 0,
      overdue: 0,
      completionRate: 0,
    };
    serviceGroup.total += 1;
    if (record.status === 'done') serviceGroup.completed += 1;
    if (record.status === 'in-progress') serviceGroup.inProgress += 1;
    if (record.status === 'pending') serviceGroup.pending += 1;
    if (record.status === 'blocked') serviceGroup.blocked += 1;
    if (isOverdue(record)) serviceGroup.overdue += 1;
    serviceGroup.completionRate = Number(((serviceGroup.completed / serviceGroup.total) * 100).toFixed(1));
    serviceGroups.set(record.service, serviceGroup);

    const priorityGroup = priorityGroups.get(record.priority) ?? {
      priority: record.priority,
      total: 0,
      completed: 0,
      overdue: 0,
    };
    priorityGroup.total += 1;
    if (record.status === 'done') priorityGroup.completed += 1;
    if (isOverdue(record)) priorityGroup.overdue += 1;
    priorityGroups.set(record.priority, priorityGroup);
  }

  return {
    summary,
    byService: [...serviceGroups.values()].sort((left, right) => right.total - left.total),
    byPriority: [...priorityGroups.values()].sort((left, right) => right.total - left.total),
  };
}

export async function getReportingSeedData(
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Promise<{
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
  const filter = buildScopedFilter(tenantId, scope);
  const [orders, doctors, patients, scanCenters, users] = await Promise.all([
    OrderModel.find(filter)
      .select({ restoration: 1, amount: 1, receivedAt: 1 })
      .lean<Array<{ restoration: string; amount: number; receivedAt: Date }>>()
      .exec(),
    DoctorModel.find(filter).select({ name: 1 }).lean<Array<{ name: string }>>().exec(),
    PatientModel.find(filter).select({ name: 1 }).lean<Array<{ name: string }>>().exec(),
    ScanCenterModel.find(tenantId ? { tenantId } : {})
      .select({ name: 1, operator: 1 })
      .lean<Array<{ name: string; operator: string }>>()
      .exec(),
    UserModel.find({
      ...(tenantId ? { tenantId } : {}),
      status: 'active',
    })
      .select({ fullName: 1, roles: 1 })
      .lean<Array<{ fullName: string; roles: string[] }>>()
      .exec(),
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

  const scanCenterNames = scanCenters.map((scanCenter) => scanCenter.name);
  const operators = [...new Set(scanCenters.map((scanCenter) => scanCenter.operator))];
  const employeeTypes = [...new Set(users.flatMap((user) => user.roles))];
  const employeeNames = users.map((user) => user.fullName);

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
    scanCenters: scanCenterNames,
    doctors: doctorNames,
    patientsFirstNames,
    patientsLastNames,
    operators,
    employeeTypes,
    employeeNames,
  };
}

export { buildPaginationMeta };

function buildScopedFilter(
  tenantId?: Types.ObjectId,
  scope?: DataVisibilityScope,
): Record<string, unknown> {
  const filter: Record<string, unknown> = tenantId ? { tenantId } : {};
  if (!scope || scope.isAdmin) {
    return filter;
  }

  if (scope.isDoctor && scope.doctorId) {
    filter.doctorId = scope.doctorId;
  } else if (scope.isTechnician) {
    filter.technicianId = scope.userId;
  } else if (scope.clinicId) {
    filter.clinicId = scope.clinicId;
  } else if (scope.isStaff || scope.isManager) {
    return filter;
  } else {
    filter._id = { $in: [] as Types.ObjectId[] };
  }

  return filter;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function buildRecentMonthRange(
  monthCount: number,
): { start: Date; end: Date; keys: string[] } {
  const now = new Date();
  const keys: string[] = [];
  for (let index = monthCount - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    keys.push(`${date.getFullYear()}-${date.getMonth() + 1}`);
  }

  const [firstYear, firstMonth] = keys[0]!.split('-');
  const start = new Date(Number(firstYear), Number(firstMonth) - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end, keys };
}

function mapMonthlyRevenueSeries(
  groupedRecords: Array<{ _id: { year: number; month: number }; revenue: number }>,
  monthKeys: string[],
): Array<{ month: string; revenue: number }> {
  const revenueByMonth = new Map(groupedRecords.map((item) => [`${item._id.year}-${item._id.month}`, Number(item.revenue) || 0]));

  return monthKeys.map((key) => {
    const [yearText, monthText] = key.split('-');
    const labelDate = new Date(Number(yearText), Number(monthText) - 1, 1);
    return {
      month: labelDate.toLocaleString('en-US', { month: 'short' }),
      revenue: Number((revenueByMonth.get(key) ?? 0).toFixed(2)),
    };
  });
}

function buildTurnaroundSeriesFromAggregation(
  records: Array<{ _id: number; days: number }>,
): Array<{ day: string; days: number }> {
  const byDay = new Map(records.map((record) => [record._id, record.days]));

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return dayNames.map((dayName, index) => {
    const mongoDay = index + 1;
    const days = byDay.get(mongoDay);
    if (days === undefined) {
      return {
        day: dayName,
        days: 0,
      };
    }

    return {
      day: dayName,
      days: Number(days.toFixed(2)),
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

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
