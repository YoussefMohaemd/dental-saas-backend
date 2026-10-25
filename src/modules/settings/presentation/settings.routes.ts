import { Router } from 'express';
import { type Types } from 'mongoose';
import { z } from 'zod';

import { ScanCenterModel } from '../../../shared/infrastructure/persistence/mongoose/models/scan-center.model';
import { UserModel } from '../../../shared/infrastructure/persistence/mongoose/models/user.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { UserPreferencesModel } from '../../../shared/infrastructure/persistence/mongoose/models/user-preferences.model';
import { sendOk } from '../../../shared/presentation/http/api-response';
import { buildRequestMeta, getAuthenticatedDataScope } from '../../../shared/presentation/http/http-utils';

const settingsRouter = Router();

const referenceDataQuerySchema = z.object({
  include: z.string().optional(),
});

const preferencesSchema = z
  .object({
    density: z.enum(['Compact', 'Default', 'Comfortable']).optional(),
    theme: z.enum(['light', 'dark']).optional(),
    language: z.string().trim().min(2).max(10).optional(),
    timeZone: z.string().trim().min(1).max(80).optional(),
    dateFormat: z.string().trim().min(1).max(30).optional(),
    notificationPrefs: z
      .object({
        orderUpdates: z.boolean(),
        changeRequests: z.boolean(),
        billingAlerts: z.boolean(),
        systemAlerts: z.boolean(),
        weeklySummary: z.boolean(),
      })
      .optional(),
  })
  .strict();

settingsRouter.get('/settings/preferences', async (req, res) => {
  const scope = await getAuthenticatedDataScope(req);
  const data = await UserPreferencesModel.findOne({
    tenantId: scope.tenantId,
    userId: scope.userId,
  })
    .lean()
    .exec();

  sendOk(res, data, buildRequestMeta(req));
});

settingsRouter.patch('/settings/preferences', async (req, res) => {
  const payload = preferencesSchema.parse(req.body);
  const scope = await getAuthenticatedDataScope(req);
  const data = await UserPreferencesModel.findOneAndUpdate(
    { tenantId: scope.tenantId, userId: scope.userId },
    { $set: payload },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
    .lean()
    .exec();

  sendOk(res, data, buildRequestMeta(req));
});

settingsRouter.get('/settings/reference-data', async (req, res) => {
  const query = referenceDataQuerySchema.parse(req.query);
  const include = query.include
    ?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const scope = await getAuthenticatedDataScope(req);
  const [scanCenters, teamMembers] = await Promise.all([
    ScanCenterModel.find({ tenantId: scope.tenantId })
      .sort({ name: 1 })
      .lean<Array<{
        externalId: string;
        name: string;
        location: string;
        operator: string;
        devices: number;
        status: 'Operational' | 'Maintenance';
      }>>()
      .exec(),
    UserModel.find({ tenantId: scope.tenantId, status: 'active' })
      .sort({ fullName: 1 })
      .select({ _id: 1, fullName: 1, roles: 1, status: 1 })
      .lean<Array<{ _id: string; fullName: string; roles: string[]; status: string }>>()
      .exec(),
  ]);
  const countsByScanCenter = await getScanCenterCounts(
    scope.tenantId,
    scanCenters.map((scanCenter) => scanCenter.externalId),
    shouldInclude(include, 'scanCenters'),
  );

  const data = {
    scanCenters: shouldInclude(include, 'scanCenters')
      ? scanCenters.map((scanCenter) => ({
          id: scanCenter.externalId,
          name: scanCenter.name,
          location: scanCenter.location,
          operator: scanCenter.operator,
          devices: scanCenter.devices,
          activeOrders: countsByScanCenter.get(scanCenter.externalId)?.activeOrders ?? 0,
          completedToday: countsByScanCenter.get(scanCenter.externalId)?.completedToday ?? 0,
          status: scanCenter.status,
        }))
      : undefined,
    quarterlyTargets: shouldInclude(include, 'quarterlyTargets') ? [] : undefined,
    teamMembers: shouldInclude(include, 'teamMembers')
      ? teamMembers.map((member) => ({
          userId: member._id,
          type: member.roles[0] ?? 'staff',
          fullName: member.fullName,
          status: member.status === 'active' ? 'Active' : 'On Leave',
        }))
      : undefined,
  };

  sendOk(res, data, buildRequestMeta(req));
});

function shouldInclude(selected: string[] | undefined, section: string): boolean {
  if (!selected || selected.length === 0) {
    return true;
  }
  return selected.includes(section);
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

async function getScanCenterCounts(
  tenantId: Types.ObjectId,
  scanCenterIds: string[],
  enabled: boolean,
): Promise<Map<string, { activeOrders: number; completedToday: number }>> {
  if (!enabled || scanCenterIds.length === 0) {
    return new Map();
  }

  const orders = await OrderModel.find({
    tenantId,
    scanCenterId: { $in: scanCenterIds },
  })
    .select({ scanCenterId: 1, status: 1, updatedAt: 1 })
    .lean<Array<{ scanCenterId?: string; status: string; updatedAt?: Date }>>()
    .exec();
  const counts = new Map<string, { activeOrders: number; completedToday: number }>();
  const today = startOfToday();

  for (const order of orders) {
    if (!order.scanCenterId) continue;
    const current = counts.get(order.scanCenterId) ?? { activeOrders: 0, completedToday: 0 };
    if (order.status !== 'Completed' && order.status !== 'Cancelled') current.activeOrders += 1;
    if (order.status === 'Completed' && order.updatedAt && order.updatedAt >= today) {
      current.completedToday += 1;
    }
    counts.set(order.scanCenterId, current);
  }

  return counts;
}

export { settingsRouter };
