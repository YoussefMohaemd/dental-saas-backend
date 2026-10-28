import { type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../application/errors/application-error';
import {
  buildPaginationMeta,
  normalizePaginationQuery,
  type PaginationMeta,
  type PaginationQuery,
} from '../../application/contracts/pagination';
import { DoctorModel } from '../../infrastructure/persistence/mongoose/models/doctor.model';
import { UserModel } from '../../infrastructure/persistence/mongoose/models/user.model';
import { hasAuthenticatedPrincipal, type RequestWithContext } from './request-context';

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export const objectIdSchema = z
  .string()
  .trim()
  .regex(OBJECT_ID_REGEX, 'Expected a 24-character ObjectId string');

export const baseListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sortBy: z.string().trim().min(1).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export function parseEnumList<TEnumValue extends string>(
  value: unknown,
  allowedValues: readonly TEnumValue[],
): TEnumValue[] | undefined {
  const parsed = parseStringList(value);
  if (!parsed || parsed.length === 0) {
    return undefined;
  }

  const invalid = parsed.find((item) => !allowedValues.includes(item as TEnumValue));
  if (invalid) {
    throw new ApplicationError({
      message: `Invalid filter value "${invalid}"`,
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: {
        allowedValues,
      },
    });
  }

  return parsed as TEnumValue[];
}

export function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  throw new ApplicationError({
    message: 'Expected boolean query parameter value',
    statusCode: 400,
    code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
    expose: true,
  });
}

export function parsePaginationQuery(query: {
  page?: number | string | undefined;
  pageSize?: number | string | undefined;
}): PaginationQuery {
  return normalizePaginationQuery({
    ...(query.page !== undefined ? { page: query.page } : {}),
    ...(query.pageSize !== undefined ? { pageSize: query.pageSize } : {}),
  });
}

export function createPaginationMeta(totalItems: number, query: PaginationQuery): PaginationMeta {
  return buildPaginationMeta(totalItems, query);
}

export function buildRequestMeta(
  req: Request,
  pagination?: PaginationMeta,
): { requestId?: string; pagination?: PaginationMeta } | undefined {
  const requestWithContext = req as RequestWithContext;
  const requestId = requestWithContext.context?.requestId;

  if (!requestId && !pagination) {
    return undefined;
  }

  return {
    ...(requestId ? { requestId } : {}),
    ...(pagination ? { pagination } : {}),
  };
}

export function parseSort(
  input: { sortBy?: string | undefined; sortDirection?: 'asc' | 'desc' | undefined },
  allowedSortFields: readonly string[],
  defaultSortBy: string,
): { sortBy: string; sortDirection: 'asc' | 'desc' } {
  const sortBy = input.sortBy ?? defaultSortBy;
  if (!allowedSortFields.includes(sortBy)) {
    throw new ApplicationError({
      message: `Unsupported sort field "${sortBy}"`,
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: {
        allowedSortFields,
      },
    });
  }

  return {
    sortBy,
    sortDirection: input.sortDirection ?? 'desc',
  };
}

export function ensureObjectId(value: string, label: string): Types.ObjectId {
  if (!OBJECT_ID_REGEX.test(value)) {
    throw new ApplicationError({
      message: `Invalid ${label}`,
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }

  return new Types.ObjectId(value);
}

export function toObjectIdOrUndefined(value: unknown): Types.ObjectId | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return OBJECT_ID_REGEX.test(value) ? new Types.ObjectId(value) : undefined;
}

export function getAuthenticatedTenantId(req: Request): Types.ObjectId {
  const principal = getAuthenticatedPrincipal(req);
  return parsePrincipalObjectId(principal.tenantId, 'tenant');
}

export function getAuthenticatedUserId(req: Request): Types.ObjectId {
  const principal = getAuthenticatedPrincipal(req);
  return parsePrincipalObjectId(principal.userId, 'user');
}

export interface AuthenticatedDataScope {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  clinicId?: Types.ObjectId;
  doctorId?: Types.ObjectId;
  roles: string[];
  isAdmin: boolean;
  isDoctor: boolean;
  isTechnician: boolean;
  isStaff: boolean;
  isManager: boolean;
}

export async function getAuthenticatedDataScope(req: Request): Promise<AuthenticatedDataScope> {
  const principal = getAuthenticatedPrincipal(req);
  const tenantId = parsePrincipalObjectId(principal.tenantId, 'tenant');
  const userId = parsePrincipalObjectId(principal.userId, 'user');
  const roles = normalizeRoleAliases(principal.roles);
  const isAdmin = roles.includes('admin');
  const isDoctor = roles.includes('doctor');
  const isTechnician = roles.includes('technician');
  const isStaff = roles.includes('staff');
  const isManager = roles.includes('manager');
  const requiresDoctorProfile = !isAdmin && isDoctor;

  const user = await UserModel.findOne({ _id: userId, tenantId })
    .select({ email: 1, clinicId: 1 })
    .lean<{ email?: string; clinicId?: Types.ObjectId } | null>()
    .exec();

  if (!user) {
    throw new ApplicationError({
      message: 'Authenticated user was not found',
      statusCode: 401,
      code: APPLICATION_ERROR_CODES.UNAUTHORIZED,
      expose: true,
    });
  }

  if (requiresDoctorProfile && !user.email) {
    throw new ApplicationError({
      message: 'Doctor role is not linked to an active doctor profile',
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      expose: true,
    });
  }

  const doctor =
    requiresDoctorProfile && user.email
      ? await DoctorModel.findOne({ tenantId, email: user.email, status: 'Active' })
          .select({ _id: 1, clinicId: 1, status: 1 })
          .lean<{ _id: Types.ObjectId; clinicId: Types.ObjectId; status: 'Active' | 'Inactive' } | null>()
          .exec()
      : null;

  if (requiresDoctorProfile && !doctor) {
    throw new ApplicationError({
      message: 'Doctor role is not linked to an active doctor profile',
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      expose: true,
    });
  }

  const clinicId = doctor?.clinicId ?? user.clinicId;

  return {
    tenantId,
    userId,
    roles,
    ...(clinicId ? { clinicId } : {}),
    ...(doctor ? { doctorId: doctor._id } : {}),
    isAdmin,
    isDoctor,
    isTechnician,
    isStaff,
    isManager,
  };
}

function normalizeRoleAliases(roles: readonly string[]): string[] {
  return Array.from(new Set(roles.map((role) => normalizeRoleAlias(role))));
}

type CanonicalRole = 'admin' | 'staff' | 'manager' | 'doctor' | 'technician';

const ROLE_ALIASES = {
  admin: new Set(['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'super admin']),
  staff: new Set(['staff']),
  manager: new Set(['manager']),
  doctor: new Set(['doctor', 'dentist', 'dental doctor']),
  technician: new Set(['technician', 'tech', 'lab-technician', 'lab_technician', 'lab tech', 'labtech']),
} as const;

function normalizeRoleAlias(role: string): CanonicalRole {
  const normalized = role.trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, '');

  if (
    ROLE_ALIASES.admin.has(normalized) ||
    ROLE_ALIASES.admin.has(compact)
  ) {
    return 'admin';
  }

  if (ROLE_ALIASES.staff.has(normalized) || ROLE_ALIASES.staff.has(compact)) {
    return 'staff';
  }

  if (ROLE_ALIASES.manager.has(normalized) || ROLE_ALIASES.manager.has(compact)) {
    return 'manager';
  }

  if (
    ROLE_ALIASES.doctor.has(normalized) ||
    ROLE_ALIASES.doctor.has(compact)
  ) {
    return 'doctor';
  }

  if (
    ROLE_ALIASES.technician.has(normalized) ||
    ROLE_ALIASES.technician.has(compact)
  ) {
    return 'technician';
  }

  throw new ApplicationError({
    message: `Unsupported role claim: ${role}`,
    statusCode: 403,
    code: APPLICATION_ERROR_CODES.FORBIDDEN,
    expose: true,
  });
}

function parseStringList(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (Array.isArray(value)) {
    const flattened: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') {
        continue;
      }

      for (const item of entry.split(',')) {
        const normalized = item.trim();
        if (normalized.length > 0) {
          flattened.push(normalized);
        }
      }
    }

    return flattened;
  }

  return undefined;
}

function getAuthenticatedPrincipal(req: Request): NonNullable<RequestWithContext['context']['principal']> {
  const requestWithContext = req as RequestWithContext;
  if (!hasAuthenticatedPrincipal(requestWithContext)) {
    throw new ApplicationError({
      message: 'Authentication is required',
      statusCode: 401,
      code: APPLICATION_ERROR_CODES.UNAUTHORIZED,
      expose: true,
    });
  }

  return requestWithContext.context.principal;
}

function parsePrincipalObjectId(value: string, label: 'tenant' | 'user'): Types.ObjectId {
  if (!OBJECT_ID_REGEX.test(value)) {
    throw new ApplicationError({
      message: `Invalid authenticated ${label} identifier`,
      statusCode: 401,
      code: APPLICATION_ERROR_CODES.UNAUTHORIZED,
      expose: true,
    });
  }

  return new Types.ObjectId(value);
}
