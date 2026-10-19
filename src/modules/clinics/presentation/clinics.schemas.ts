import { z } from 'zod';

import { CLINIC_STATUSES } from '../domain/clinic';

const stringField = z.string().trim().min(1);

const listSortBy = z.enum(['name', 'city', 'status', 'accountManager', 'createdAt', 'updatedAt']);
const sortDirection = z.enum(['asc', 'desc']);

const statusSchema = z.enum(CLINIC_STATUSES);
const statusesQuerySchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return [];
    }

    if (typeof value === 'string') {
      return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
    }

    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }

    return [];
  },
  z.array(statusSchema),
);

export const clinicIdParamsSchema = z.object({
  clinicId: z.string().trim().min(1),
});

export const clinicsListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sortBy: listSortBy.default('createdAt'),
  sortDirection: sortDirection.default('desc'),
  status: statusesQuerySchema.default([]),
});

export const createClinicBodySchema = z.object({
  name: stringField,
  address: stringField,
  city: stringField,
  phone: stringField,
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  status: statusSchema.default('Active'),
  accountManager: stringField,
}).strict();

export const updateClinicBodySchema = createClinicBodySchema.partial().strict();
