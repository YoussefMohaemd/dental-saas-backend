import { Router } from 'express';
import { z } from 'zod';

import { sendCreated, sendNoContent, sendOk } from '../../../shared/presentation/http/api-response';
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
  createDocument,
  deleteDocument,
  getDocumentById,
  listDocuments,
  parseCreateDocumentPayload,
  parseDocumentCategoryFilters,
} from '../application/documents-service';

const documentsRouter = Router();

const documentsListQuerySchema = baseListQuerySchema.extend({
  category: z.union([z.string(), z.array(z.string())]).optional(),
});

documentsRouter.get('/documents', async (req, res) => {
  const query = documentsListQuerySchema.parse(req.query);
  const pagination = parsePaginationQuery(query);
  const sort = parseSort(query, ['name', 'date', 'sizeBytes', 'category', 'type'], 'date');
  const categories = parseDocumentCategoryFilters(query.category);
  const tenantId = getAuthenticatedTenantId(req);

  const result = await listDocuments({
    pagination,
    search: query.search,
    categories,
    sortBy: sort.sortBy as 'name' | 'date' | 'sizeBytes' | 'category' | 'type',
    sortDirection: sort.sortDirection,
    tenantId,
  });

  sendOk(res, result.items, buildRequestMeta(req, buildPaginationMeta(result.totalItems, pagination)));
});

documentsRouter.get('/documents/:documentId', async (req, res) => {
  const params = z.object({ documentId: z.string() }).parse(req.params);
  const documentId = ensureObjectId(params.documentId, 'document id');
  const tenantId = getAuthenticatedTenantId(req);
  const data = await getDocumentById(documentId, tenantId);

  sendOk(res, data, buildRequestMeta(req));
});

documentsRouter.post('/documents', async (req, res) => {
  const payload = parseCreateDocumentPayload(req.body);
  const tenantId = getAuthenticatedTenantId(req);
  const data = await createDocument(payload, tenantId);

  sendCreated(res, data, buildRequestMeta(req));
});

documentsRouter.delete('/documents/:documentId', async (req, res) => {
  const params = z.object({ documentId: z.string() }).parse(req.params);
  const documentId = ensureObjectId(params.documentId, 'document id');
  const tenantId = getAuthenticatedTenantId(req);
  await deleteDocument(documentId, tenantId);

  sendNoContent(res);
});

export { documentsRouter };
