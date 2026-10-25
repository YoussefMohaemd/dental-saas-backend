import { ENTITY_ACTIVITY_STATUSES, type EntityActivityStatus } from '../../../shared/domain/entities/dental-data-model';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export interface Clinic {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  status: EntityActivityStatus;
  accountManager: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicListQuery {
  scope: DataVisibilityScope;
  search?: string | undefined;
  page: number;
  pageSize: number;
  sortBy: 'name' | 'city' | 'status' | 'accountManager' | 'createdAt' | 'updatedAt';
  sortDirection: 'asc' | 'desc';
  statuses: EntityActivityStatus[];
}

export interface ClinicWritePayload {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  status: EntityActivityStatus;
  accountManager: string;
}

export interface ClinicUpdatePayload {
  name?: string | undefined;
  address?: string | undefined;
  city?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  status?: EntityActivityStatus | undefined;
  accountManager?: string | undefined;
}

export const CLINIC_STATUSES = ENTITY_ACTIVITY_STATUSES;
