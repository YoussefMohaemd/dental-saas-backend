import { z } from 'zod';

import { DOCTOR_STATUSES } from '../domain/doctor';

const stringField = z.string().trim().min(1);
const statusSchema = z.enum(DOCTOR_STATUSES);
const listSortBy = z.enum(['name', 'specialty', 'status', 'joinedDate', 'createdAt', 'updatedAt']);
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

export const doctorIdParamsSchema = z.object({
  doctorId: z.string().trim().min(1),
});

export const doctorsListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sortBy: listSortBy.default('createdAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  clinicId: z.string().trim().min(1).optional(),
  status: statusesQuerySchema.default([]),
});

export const createDoctorBodySchema = z.object({
  lookupId: z.string().trim().min(1).optional(),
  name: stringField,
  specialty: stringField,
  clinicId: z.string().trim().min(1),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  phone: stringField,
  status: statusSchema.default('Active'),
  joinedDate: z.coerce.date(),
  avatar: z.string().trim().default(''),
}).strict();

export const updateDoctorBodySchema = z
  .object({
    lookupId: z.string().trim().min(1).optional(),
    name: stringField.optional(),
    specialty: stringField.optional(),
    clinicId: z.string().trim().min(1).optional(),
    email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
    phone: stringField.optional(),
    status: statusSchema.optional(),
    joinedDate: z.coerce.date().optional(),
    avatar: z.string().trim().optional(),
  })
  .strict();
