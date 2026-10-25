import { Router } from 'express';
import { z } from 'zod';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import {
  buildRequestMeta,
  createPaginationMeta,
  getAuthenticatedDataScope,
  parsePaginationQuery,
  parseSort,
} from '../../../shared/presentation/http/http-utils';
import { sendOk } from '../../../shared/presentation/http/api-response';
import { MongooseScanCenterRepository } from '../infrastructure/mongoose-scan-center-repository';

const scanCentersRouter = Router();
const scanCenterRepository = new MongooseScanCenterRepository();

const scanCentersListSchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sortBy: z.enum(['name', 'location', 'operator', 'devices', 'status']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  status: z.string().optional(),
});

scanCentersRouter.get('/scan-centers', async (req, res) => {
  const query = scanCentersListSchema.parse(req.query);
  const pagination = parsePaginationQuery(query);
  const sort = parseSort(
    query,
    ['name', 'location', 'operator', 'devices', 'status'],
    'name',
  );
  const statuses = query.status
    ?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const result = await scanCenterRepository.list(
    {
      ...(query.search ? { search: query.search } : {}),
      ...(statuses ? { statuses } : {}),
      page: pagination.page,
      pageSize: pagination.pageSize,
      sortBy: sort.sortBy as 'name' | 'location' | 'operator' | 'devices' | 'status',
      sortDirection: sort.sortDirection,
    },
    await getAuthenticatedDataScope(req),
  );

  sendOk(
    res,
    result.items,
    buildRequestMeta(req, createPaginationMeta(result.totalItems, pagination)),
  );
});

scanCentersRouter.get('/scan-centers/:scanCenterId', async (req, res) => {
  const params = z.object({ scanCenterId: z.string().trim().min(1) }).parse(req.params);
  const scanCenter = await scanCenterRepository.findById(
    params.scanCenterId,
    await getAuthenticatedDataScope(req),
  );

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

export { scanCentersRouter };
