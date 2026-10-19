import { Router } from 'express';
import { z } from 'zod';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import {
  createPaginationMeta,
  parsePaginationQuery,
  parseSort,
  buildRequestMeta,
} from '../../../shared/presentation/http/http-utils';
import { sendOk } from '../../../shared/presentation/http/api-response';
import { InMemorySettingsStore } from '../../settings/infrastructure/settings-store';

const scanCentersRouter = Router();
const settingsStore = new InMemorySettingsStore();

const scanCentersListSchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sortBy: z.enum(['name', 'location', 'operator', 'devices', 'activeOrders', 'completedToday', 'status']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  status: z.string().optional(),
});

scanCentersRouter.get('/scan-centers', (req, res) => {
  const query = scanCentersListSchema.parse(req.query);
  const pagination = parsePaginationQuery(query);
  const sort = parseSort(query, ['name', 'location', 'operator', 'devices', 'activeOrders', 'completedToday', 'status'], 'name');
  const statuses = query.status
    ?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  let items = settingsStore.getSnapshot().scanCenters;

  if (statuses && statuses.length > 0) {
    items = items.filter((item) => statuses.includes(item.status));
  }

  if (query.search) {
    const normalizedSearch = query.search.toLowerCase();
    items = items.filter((item) =>
      [item.name, item.location, item.operator, item.status]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }

  items = [...items].sort((left, right) => {
    const leftValue = getSortableFieldValue(left, sort.sortBy);
    const rightValue = getSortableFieldValue(right, sort.sortBy);
    return compareValues(leftValue, rightValue, sort.sortDirection);
  });

  const totalItems = items.length;
  const startIndex = (pagination.page - 1) * pagination.pageSize;
  const pagedItems = items.slice(startIndex, startIndex + pagination.pageSize);
  const paginationMeta = createPaginationMeta(totalItems, pagination);

  sendOk(res, pagedItems, buildRequestMeta(req, paginationMeta));
});

scanCentersRouter.get('/scan-centers/:scanCenterId', (req, res) => {
  const params = z.object({ scanCenterId: z.string().trim().min(1) }).parse(req.params);
  const scanCenter = settingsStore
    .getSnapshot()
    .scanCenters.find((item) => item.id === params.scanCenterId);

  if (!scanCenter) {
    throw new ApplicationError({
      message: 'Scan center not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  sendOk(res, scanCenter, buildRequestMeta(req));
});

function compareValues(
  left: string | number,
  right: string | number,
  direction: 'asc' | 'desc',
): number {
  const multiplier = direction === 'asc' ? 1 : -1;
  if (typeof left === 'number' && typeof right === 'number') {
    return (left - right) * multiplier;
  }

  return String(left).localeCompare(String(right)) * multiplier;
}

function getSortableFieldValue(
  item: {
    name: string;
    location: string;
    operator: string;
    devices: number;
    activeOrders: number;
    completedToday: number;
    status: string;
  },
  sortBy: string,
): string | number {
  switch (sortBy) {
    case 'name':
      return item.name;
    case 'location':
      return item.location;
    case 'operator':
      return item.operator;
    case 'devices':
      return item.devices;
    case 'activeOrders':
      return item.activeOrders;
    case 'completedToday':
      return item.completedToday;
    case 'status':
      return item.status;
    default:
      return item.name;
  }
}

export { scanCentersRouter };
