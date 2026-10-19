import { z } from 'zod';

import { PATIENT_STATUSES } from '../domain/patient';

const stringField = z.string().trim().min(1);
const statusSchema = z.enum(PATIENT_STATUSES);
const genderSchema = z.enum(['M', 'F']);
const listSortBy = z.enum(['name', 'dob', 'gender', 'status', 'lastVisit', 'createdAt', 'updatedAt']);
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

export const patientIdParamsSchema = z.object({
  patientId: z.string().trim().min(1),
});

export const patientsListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sortBy: listSortBy.default('createdAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  status: statusesQuerySchema.default([]),
});

export const createPatientBodySchema = z.object({
  name: stringField,
  dob: z.coerce.date(),
  gender: genderSchema,
  phone: stringField,
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  clinicId: z.string().trim().min(1),
  doctorId: z.string().trim().min(1),
  status: statusSchema.default('Active'),
  lastVisit: z.coerce.date(),
}).strict();

export const updatePatientBodySchema = z
  .object({
    name: stringField.optional(),
    dob: z.coerce.date().optional(),
    gender: genderSchema.optional(),
    phone: stringField.optional(),
    email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
    clinicId: z.string().trim().min(1).optional(),
    doctorId: z.string().trim().min(1).optional(),
    status: statusSchema.optional(),
    lastVisit: z.coerce.date().optional(),
  })
  .strict();
