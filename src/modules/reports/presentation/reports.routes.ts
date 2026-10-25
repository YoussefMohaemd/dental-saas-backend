import { Router } from 'express';
import { z } from 'zod';

import { sendOk } from '../../../shared/presentation/http/api-response';
import {
  baseListQuerySchema,
  buildRequestMeta,
  getAuthenticatedDataScope,
  parsePaginationQuery,
  parseSort,
} from '../../../shared/presentation/http/http-utils';
import {
  buildPaginationMeta,
  getDashboardVolume,
  getOrdersRangeReport,
  getQuarterlyTargets,
  getReportingSeedData,
  getReportsOverview,
  getSubOrderReport,
  getTeamPerformance,
} from '../application/reports-service';

const reportsRouter = Router();

const ordersRangeQuerySchema = baseListQuerySchema.extend({
  from: z.string().optional(),
  to: z.string().optional(),
});

reportsRouter.get('/dashboard/volume', async (req, res) => {
  const scope = await getAuthenticatedDataScope(req);
  const data = await getDashboardVolume(scope.tenantId, scope);

  sendOk(res, data, buildRequestMeta(req));
});

reportsRouter.get('/reports/overview', async (req, res) => {
  const scope = await getAuthenticatedDataScope(req);
  const data = await getReportsOverview(scope.tenantId, scope);

  sendOk(res, data, buildRequestMeta(req));
});

reportsRouter.get('/reports/seed', async (req, res) => {
  const scope = await getAuthenticatedDataScope(req);
  const data = await getReportingSeedData(scope.tenantId, scope);

  sendOk(res, data, buildRequestMeta(req));
});

reportsRouter.get('/reports/orders-range', async (req, res) => {
  const query = ordersRangeQuerySchema.parse(req.query);
  const pagination = parsePaginationQuery(query);
  const sort = parseSort(
    query,
    ['receivedAt', 'sentAt', 'amount', 'archiveDate', 'chargedAt', 'orderNumber'],
    'receivedAt',
  );
  const scope = await getAuthenticatedDataScope(req);
  const data = await getOrdersRangeReport({
    pagination,
    from: parseDateOrUndefined(query.from),
    to: parseDateOrUndefined(query.to),
    search: query.search,
    sortBy: sort.sortBy as 'receivedAt' | 'sentAt' | 'amount' | 'archiveDate' | 'chargedAt' | 'orderNumber',
    sortDirection: sort.sortDirection,
    tenantId: scope.tenantId,
    scope,
  });

  sendOk(res, data.items, buildRequestMeta(req, buildPaginationMeta(data.totalItems, pagination)));
});

reportsRouter.get('/reports/quarterly-targets', async (req, res) => {
  const query = z
    .object({
      year: z.coerce.number().int().min(2000).max(3000),
      quarter: z.coerce.number().int().min(1).max(4).optional(),
    })
    .parse(req.query);

  const scope = await getAuthenticatedDataScope(req);
  const data = await getQuarterlyTargets(
    query.year,
    query.quarter as 1 | 2 | 3 | 4 | undefined,
    scope.tenantId,
    scope,
  );
  sendOk(res, data, buildRequestMeta(req));
});

reportsRouter.get('/reports/quarterly-targets/:year/:quarter', async (req, res) => {
  const params = z
    .object({
      year: z.coerce.number().int().min(2000).max(3000),
      quarter: z.coerce.number().int().min(1).max(4),
    })
    .parse(req.params);

  const scope = await getAuthenticatedDataScope(req);
  const data = await getQuarterlyTargets(
    params.year,
    params.quarter as 1 | 2 | 3 | 4,
    scope.tenantId,
    scope,
  );
  sendOk(res, data, buildRequestMeta(req));
});

reportsRouter.get('/reports/team-performance', async (req, res) => {
  const scope = await getAuthenticatedDataScope(req);
  const data = await getTeamPerformance(scope.tenantId, scope);
  sendOk(res, data.records, buildRequestMeta(req));
});

reportsRouter.get('/reports/sub-orders', async (req, res) => {
  const query = z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      service: z.string().trim().min(1).optional(),
      status: z.union([
        z.enum(['done', 'in-progress', 'pending', 'blocked']),
        z.array(z.enum(['done', 'in-progress', 'pending', 'blocked'])),
      ]).optional(),
    })
    .parse(req.query);
  const scope = await getAuthenticatedDataScope(req);
  const statuses = query.status === undefined
    ? undefined
    : Array.isArray(query.status)
      ? query.status
      : [query.status];
  const data = await getSubOrderReport({
    from: parseDateOrUndefined(query.from),
    to: parseDateOrUndefined(query.to),
    service: query.service,
    statuses,
    tenantId: scope.tenantId,
    scope,
  });

  sendOk(res, data, buildRequestMeta(req));
});

function parseDateOrUndefined(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

export { reportsRouter };
