import { Router } from 'express';
import { z } from 'zod';

import { sendOk } from '../../../shared/presentation/http/api-response';
import {
  baseListQuerySchema,
  buildRequestMeta,
  getAuthenticatedTenantId,
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
  getTeamPerformance,
} from '../application/reports-service';

const reportsRouter = Router();

const ordersRangeQuerySchema = baseListQuerySchema.extend({
  from: z.string().optional(),
  to: z.string().optional(),
});

reportsRouter.get('/dashboard/volume', async (req, res) => {
  const tenantId = getAuthenticatedTenantId(req);
  const data = await getDashboardVolume(tenantId);

  sendOk(res, data, buildRequestMeta(req));
});

reportsRouter.get('/reports/overview', async (req, res) => {
  const tenantId = getAuthenticatedTenantId(req);
  const data = await getReportsOverview(tenantId);

  sendOk(res, data, buildRequestMeta(req));
});

reportsRouter.get('/reports/seed', async (req, res) => {
  const tenantId = getAuthenticatedTenantId(req);
  const data = await getReportingSeedData(tenantId);

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
  const tenantId = getAuthenticatedTenantId(req);
  const data = await getOrdersRangeReport({
    pagination,
    from: parseDateOrUndefined(query.from),
    to: parseDateOrUndefined(query.to),
    search: query.search,
    sortBy: sort.sortBy as 'receivedAt' | 'sentAt' | 'amount' | 'archiveDate' | 'chargedAt' | 'orderNumber',
    sortDirection: sort.sortDirection,
    tenantId,
  });

  sendOk(res, data.items, buildRequestMeta(req, buildPaginationMeta(data.totalItems, pagination)));
});

reportsRouter.get('/reports/quarterly-targets', (req, res) => {
  const query = z
    .object({
      year: z.coerce.number().int().min(2000).max(3000),
      quarter: z.coerce.number().int().min(1).max(4).optional(),
    })
    .parse(req.query);

  const data = getQuarterlyTargets(query.year, query.quarter as 1 | 2 | 3 | 4 | undefined);
  sendOk(res, data, buildRequestMeta(req));
});

reportsRouter.get('/reports/quarterly-targets/:year/:quarter', (req, res) => {
  const params = z
    .object({
      year: z.coerce.number().int().min(2000).max(3000),
      quarter: z.coerce.number().int().min(1).max(4),
    })
    .parse(req.params);

  const data = getQuarterlyTargets(params.year, params.quarter as 1 | 2 | 3 | 4);
  sendOk(res, data, buildRequestMeta(req));
});

reportsRouter.get('/reports/team-performance', async (req, res) => {
  const tenantId = getAuthenticatedTenantId(req);
  const data = await getTeamPerformance(tenantId);
  sendOk(res, data.records, buildRequestMeta(req));
});

function parseDateOrUndefined(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

export { reportsRouter };
