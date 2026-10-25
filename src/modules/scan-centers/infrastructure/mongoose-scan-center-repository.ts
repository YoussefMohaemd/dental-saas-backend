import { type Types } from 'mongoose';

import { ScanCenterModel } from '../../../shared/infrastructure/persistence/mongoose/models/scan-center.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export interface ScanCenterListQuery {
  search?: string;
  statuses?: string[];
  sortBy: 'name' | 'location' | 'operator' | 'devices' | 'status';
  sortDirection: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface ScanCenterListItem {
  id: string;
  name: string;
  location: string;
  operator: string;
  devices: number;
  activeOrders: number;
  completedToday: number;
  status: 'Operational' | 'Maintenance';
}

export class MongooseScanCenterRepository {
  public async list(
    query: ScanCenterListQuery,
    scope: DataVisibilityScope,
  ): Promise<{ items: ScanCenterListItem[]; totalItems: number }> {
    const filter: Record<string, unknown> = { tenantId: scope.tenantId };
    if (query.statuses && query.statuses.length > 0) {
      filter.status = { $in: query.statuses };
    }
    if (query.search) {
      const search = escapeRegExp(query.search);
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { location: new RegExp(search, 'i') },
        { operator: new RegExp(search, 'i') },
      ];
    }

    const sortDirection = query.sortDirection === 'asc' ? 1 : -1;
    const [records, totalItems] = await Promise.all([
      ScanCenterModel.find(filter)
        .sort({ [query.sortBy]: sortDirection })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean<Array<{
          externalId: string;
          name: string;
          location: string;
          operator: string;
          devices: number;
          status: 'Operational' | 'Maintenance';
        }>>()
        .exec(),
      ScanCenterModel.countDocuments(filter).exec(),
    ]);

    const ids = records.map((record) => record.externalId);
    const orderCounts = await this.getOrderCounts(scope.tenantId, ids);

    return {
      totalItems,
      items: records.map((record) => ({
        id: record.externalId,
        name: record.name,
        location: record.location,
        operator: record.operator,
        devices: record.devices,
        status: record.status,
        activeOrders: orderCounts.get(record.externalId)?.activeOrders ?? 0,
        completedToday: orderCounts.get(record.externalId)?.completedToday ?? 0,
      })),
    };
  }

  public async findById(
    externalId: string,
    scope: DataVisibilityScope,
  ): Promise<ScanCenterListItem | null> {
    const record = await ScanCenterModel.findOne({
      tenantId: scope.tenantId,
      externalId,
    })
      .lean<{
        externalId: string;
        name: string;
        location: string;
        operator: string;
        devices: number;
        status: 'Operational' | 'Maintenance';
      } | null>()
      .exec();

    if (!record) {
      return null;
    }

    const counts = await this.getOrderCounts(scope.tenantId, [externalId]);
    return {
      id: record.externalId,
      name: record.name,
      location: record.location,
      operator: record.operator,
      devices: record.devices,
      status: record.status,
      activeOrders: counts.get(externalId)?.activeOrders ?? 0,
      completedToday: counts.get(externalId)?.completedToday ?? 0,
    };
  }

  private async getOrderCounts(
    tenantId: Types.ObjectId,
    scanCenterIds: string[],
  ): Promise<Map<string, { activeOrders: number; completedToday: number }>> {
    if (scanCenterIds.length === 0) {
      return new Map();
    }

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const orders = await OrderModel.find({
      tenantId,
      scanCenterId: { $in: scanCenterIds },
    })
      .select({ scanCenterId: 1, status: 1, updatedAt: 1 })
      .lean<Array<{ scanCenterId?: string; status: string; updatedAt?: Date }>>()
      .exec();

    const counts = new Map<string, { activeOrders: number; completedToday: number }>();
    for (const order of orders) {
      if (!order.scanCenterId) {
        continue;
      }
      const current = counts.get(order.scanCenterId) ?? { activeOrders: 0, completedToday: 0 };
      if (order.status !== 'Completed' && order.status !== 'Cancelled') {
        current.activeOrders += 1;
      }
      if (order.status === 'Completed' && order.updatedAt && order.updatedAt >= startOfToday) {
        current.completedToday += 1;
      }
      counts.set(order.scanCenterId, current);
    }
    return counts;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
