import { z } from 'zod';

import { SUPPORTED_USER_ROLES, USER_STATUSES } from '../domain/user';

const roleSchema = z.enum(SUPPORTED_USER_ROLES);
const statusSchema = z.enum(USER_STATUSES);

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

export const userIdParamsSchema = z.object({
  userId: z.string().trim().min(1),
});

export const usersListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sortBy: z.enum(['fullName', 'email', 'status', 'lastLoginAt', 'createdAt', 'updatedAt']).default('createdAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  status: statusesQuerySchema.default([]),
  role: roleSchema.optional(),
});

export const createUserBodySchema = z.object({
  fullName: z.string().trim().min(1),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  roles: z.array(roleSchema).min(1),
  status: statusSchema.default('invited'),
  clinicId: z.string().trim().min(1).optional(),
  avatarUrl: z.string().trim().min(1).optional(),
  password: z.string().min(8).max(128).optional(),
})
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'active' && value.password === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'password is required when status is active',
        path: ['password'],
      });
    }
  });

export const updateUserRoleStatusBodySchema = z
  .object({
    roles: z.array(roleSchema).min(1).optional(),
    status: statusSchema.optional(),
  })
  .strict()
  .refine((value) => value.roles !== undefined || value.status !== undefined, {
    message: 'At least one field must be provided for update',
    path: [],
  });
