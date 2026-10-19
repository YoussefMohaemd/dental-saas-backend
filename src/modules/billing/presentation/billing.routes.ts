import { Router } from 'express';
import { z } from 'zod';

import { sendOk } from '../../../shared/presentation/http/api-response';
import {
  baseListQuerySchema,
  buildRequestMeta,
  ensureObjectId,
  getAuthenticatedTenantId,
  parsePaginationQuery,
  parseSort,
} from '../../../shared/presentation/http/http-utils';
import {
  buildPaginationMeta,
  getBillingRecord,
  listBillingRecords,
  parseBillingPatchPayload,
  parseBillingStatusFilters,
  parseOptionalDate,
  updateBillingRecord,
} from '../application/billing-service';

const billingRouter = Router();

const billingListQuerySchema = baseListQuerySchema.extend({
  status: z.union([z.string(), z.array(z.string())]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

billingRouter.get('/billing', async (req, res) => {
  const query = billingListQuerySchema.parse(req.query);
  const pagination = parsePaginationQuery(query);
  const sort = parseSort(
    query,
    ['dueDate', 'amount', 'status', 'createdAt', 'updatedAt', 'invoiceDate'],
    'dueDate',
  );
  const statuses = parseBillingStatusFilters(query.status);
  const tenantId = getAuthenticatedTenantId(req);

  const result = await listBillingRecords({
    pagination,
    search: query.search,
    statuses,
    dateFrom: parseOptionalDate(query.dateFrom),
    dateTo: parseOptionalDate(query.dateTo),
    sortBy: sort.sortBy as 'dueDate' | 'amount' | 'status' | 'createdAt' | 'updatedAt' | 'invoiceDate',
    sortDirection: sort.sortDirection,
    tenantId,
  });

  sendOk(res, result.items, buildRequestMeta(req, buildPaginationMeta(result.totalItems, pagination)));
});

billingRouter.get('/billing/:recordId', async (req, res) => {
  const params = z.object({ recordId: z.string() }).parse(req.params);
  const billingId = ensureObjectId(params.recordId, 'billing record id');
  const tenantId = getAuthenticatedTenantId(req);
  const data = await getBillingRecord(billingId, tenantId);

  sendOk(res, data, buildRequestMeta(req));
});

billingRouter.patch('/billing/:recordId', async (req, res) => {
  const params = z.object({ recordId: z.string() }).parse(req.params);
  const billingId = ensureObjectId(params.recordId, 'billing record id');
  const payload = parseBillingPatchPayload(req.body);
  const tenantId = getAuthenticatedTenantId(req);
  const data = await updateBillingRecord(billingId, payload, tenantId);

  sendOk(res, data, buildRequestMeta(req));
});

export { billingRouter };
