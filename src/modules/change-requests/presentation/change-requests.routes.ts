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
  decideChangeRequest,
  getChangeRequest,
  listChangeRequests,
  parseChangeRequestPriorities,
  parseChangeRequestStatuses,
  parseDecisionPayload,
} from '../application/change-requests-service';

const changeRequestsRouter = Router();

const changeRequestsListQuerySchema = baseListQuerySchema.extend({
  status: z.union([z.string(), z.array(z.string())]).optional(),
  priority: z.union([z.string(), z.array(z.string())]).optional(),
});

changeRequestsRouter.get('/change-requests', async (req, res) => {
  const query = changeRequestsListQuerySchema.parse(req.query);
  const pagination = parsePaginationQuery(query);
  const sort = parseSort(
    query,
    ['createdAt', 'updatedAt', 'priority', 'status', 'requestNumber'],
    'updatedAt',
  );
  const statuses = parseChangeRequestStatuses(query.status);
  const priorities = parseChangeRequestPriorities(query.priority);
  const tenantId = getAuthenticatedTenantId(req);

  const result = await listChangeRequests({
    pagination,
    search: query.search,
    statuses,
    priorities,
    sortBy: sort.sortBy as 'createdAt' | 'updatedAt' | 'priority' | 'status' | 'requestNumber',
    sortDirection: sort.sortDirection,
    tenantId,
  });

  sendOk(res, result.items, buildRequestMeta(req, buildPaginationMeta(result.totalItems, pagination)));
});

changeRequestsRouter.get('/change-requests/:requestId', async (req, res) => {
  const params = z.object({ requestId: z.string() }).parse(req.params);
  const changeRequestId = ensureObjectId(params.requestId, 'change request id');
  const tenantId = getAuthenticatedTenantId(req);
  const data = await getChangeRequest(changeRequestId, tenantId);

  sendOk(res, data, buildRequestMeta(req));
});

changeRequestsRouter.patch('/change-requests/:requestId/status', async (req, res) => {
  const params = z.object({ requestId: z.string() }).parse(req.params);
  const changeRequestId = ensureObjectId(params.requestId, 'change request id');
  const payload = parseDecisionPayload(req.body);
  const tenantId = getAuthenticatedTenantId(req);
  const data = await decideChangeRequest(changeRequestId, payload, tenantId);

  sendOk(res, data, buildRequestMeta(req));
});

export { changeRequestsRouter };
