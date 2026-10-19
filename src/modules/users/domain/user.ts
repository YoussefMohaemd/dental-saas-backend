import { USER_STATUSES, type UserStatus } from '../../../shared/domain/entities/dental-data-model';

export const SUPPORTED_USER_ROLES = ['admin', 'technician', 'doctor', 'manager', 'staff'] as const;
export type SupportedUserRole = (typeof SUPPORTED_USER_ROLES)[number];

export interface User {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  roles: string[];
  clinicId?: string | undefined;
  avatarUrl?: string | undefined;
  status: UserStatus;
  lastLoginAt?: Date | undefined;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserListQuery {
  search?: string | undefined;
  page: number;
  pageSize: number;
  sortBy: 'fullName' | 'email' | 'status' | 'lastLoginAt' | 'createdAt' | 'updatedAt';
  sortDirection: 'asc' | 'desc';
  statuses: UserStatus[];
  role?: SupportedUserRole | undefined;
}

export interface UserCreatePayload {
  tenantId: string;
  fullName: string;
  email: string;
  roles: SupportedUserRole[];
  status: UserStatus;
  clinicId?: string | undefined;
  avatarUrl?: string | undefined;
  passwordHash?: string | undefined;
}

export interface UserRoleStatusUpdatePayload {
  roles?: SupportedUserRole[] | undefined;
  status?: UserStatus | undefined;
}

export { USER_STATUSES };
