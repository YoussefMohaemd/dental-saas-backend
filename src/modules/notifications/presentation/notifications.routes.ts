import { Router } from 'express';
import { z } from 'zod';

import { sendOk } from '../../../shared/presentation/http/api-response';
import {
  baseListQuerySchema,
  buildRequestMeta,
  ensureObjectId,
  getAuthenticatedTenantId,
  getAuthenticatedUserId,
  parseOptionalBoolean,
  parsePaginationQuery,
  parseSort,
} from '../../../shared/presentation/http/http-utils';
import {
  buildPaginationMeta,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  parseNotificationTypeFilters,
} from '../application/notifications-service';

const notificationsRouter = Router();

const notificationsListQuerySchema = baseListQuerySchema.extend({
  type: z.union([z.string(), z.array(z.string())]).optional(),
  read: z.union([z.string(), z.boolean()]).optional(),
});

notificationsRouter.get('/notifications', async (req, res) => {
  const query = notificationsListQuerySchema.parse(req.query);
  const pagination = parsePaginationQuery(query);
  const sort = parseSort(query, ['createdAt', 'type', 'read', 'title'], 'createdAt');
  const types = parseNotificationTypeFilters(query.type);
  const read = parseOptionalBoolean(query.read);
  const tenantId = getAuthenticatedTenantId(req);
  const recipientId = getAuthenticatedUserId(req);

  const result = await listNotifications({
    pagination,
    search: query.search,
    types,
    read,
    sortBy: sort.sortBy as 'createdAt' | 'type' | 'read' | 'title',
    sortDirection: sort.sortDirection,
    tenantId,
    recipientId,
  });

  sendOk(res, result.items, buildRequestMeta(req, buildPaginationMeta(result.totalItems, pagination)));
});

notificationsRouter.post('/notifications/:notificationId/read', async (req, res) => {
  const params = z.object({ notificationId: z.string() }).parse(req.params);
  const notificationId = ensureObjectId(params.notificationId, 'notification id');
  const tenantId = getAuthenticatedTenantId(req);
  const recipientId = getAuthenticatedUserId(req);

  const data = await markNotificationRead(notificationId, tenantId, recipientId);
  sendOk(res, data, buildRequestMeta(req));
});

notificationsRouter.post('/notifications/read-all', async (req, res) => {
  const tenantId = getAuthenticatedTenantId(req);
  const recipientId = getAuthenticatedUserId(req);
  const data = await markAllNotificationsRead({ tenantId, recipientId });

  sendOk(res, data, buildRequestMeta(req));
});

export { notificationsRouter };
