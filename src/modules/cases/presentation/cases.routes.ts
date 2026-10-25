import { Router } from 'express';
import { z } from 'zod';

import { requireAnyRole } from '../../auth/presentation/auth.middleware';
import { sendOk } from '../../../shared/presentation/http/api-response';
import {
  baseListQuerySchema,
  buildRequestMeta,
  createPaginationMeta,
  ensureObjectId,
  getAuthenticatedDataScope,
  parsePaginationQuery,
  parseSort,
} from '../../../shared/presentation/http/http-utils';
import {
  createCase,
  listCases,
  getCaseById,
  parseCaseStatusFilters,
} from '../application/cases-service';

const casesRouter = Router();

const casesQuerySchema = baseListQuerySchema.extend({
  status: z.union([z.string(), z.array(z.string())]).optional(),
});
const createCaseBodySchema = z
  .object({
    caseNumber: z.string().trim().min(1),
    title: z.string().trim().min(3),
    patientId: z.string().trim().min(1),
    doctorId: z.string().trim().min(1),
    clinicId: z.string().trim().min(1),
    status: z.enum(['Open', 'In Progress', 'Review', 'Closed']).default('Open'),
    priority: z.enum(['Low', 'Normal', 'High', 'Urgent']).default('Normal'),
    notes: z.string().default(''),
  })
  .strict();

casesRouter.post('/cases', requireAnyRole(['admin', 'staff', 'doctor', 'technician']), async (req, res) => {
  const payload = createCaseBodySchema.parse(req.body);
  const scope = await getAuthenticatedDataScope(req);
  const created = await createCase({
    ...payload,
    tenantId: scope.tenantId,
  });

  sendOk(res, created, buildRequestMeta(req));
});

casesRouter.get('/cases', async (req, res) => {
  const query = casesQuerySchema.parse(req.query);
  const pagination = parsePaginationQuery(query);
  const sort = parseSort(
    query,
    ['caseNumber', 'title', 'createdAt', 'updatedAt', 'priority', 'status'],
    'updatedAt',
  );
  const statuses = parseCaseStatusFilters(query.status);
  const scope = await getAuthenticatedDataScope(req);

  const result = await listCases({
    pagination,
    search: query.search,
    statuses,
    sortBy: sort.sortBy as
      'caseNumber' | 'title' | 'createdAt' | 'updatedAt' | 'priority' | 'status',
    sortDirection: sort.sortDirection,
    tenantId: scope.tenantId,
    scope,
  });

  sendOk(
    res,
    result.items,
    buildRequestMeta(req, createPaginationMeta(result.pagination.totalItems, pagination)),
  );
});

casesRouter.get('/cases/:caseId', async (req, res) => {
  const params = z.object({ caseId: z.string() }).parse(req.params);
  const caseId = ensureObjectId(params.caseId, 'case id');
  const scope = await getAuthenticatedDataScope(req);
  const data = await getCaseById(caseId, scope.tenantId, scope);

  sendOk(res, data, buildRequestMeta(req));
});

export { casesRouter };
