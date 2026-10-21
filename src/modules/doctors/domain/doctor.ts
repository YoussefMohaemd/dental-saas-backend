import { ENTITY_ACTIVITY_STATUSES, type EntityActivityStatus } from '../../../shared/domain/entities/dental-data-model';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export interface Doctor {
  id: string;
  lookupId?: string | undefined;
  name: string;
  specialty: string;
  clinicId: string;
  email: string;
  phone: string;
  status: EntityActivityStatus;
  joinedDate: Date;
  avatar: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DoctorListQuery {
  scope?: DataVisibilityScope;
  search?: string | undefined;
  page: number;
  pageSize: number;
  sortBy: 'name' | 'specialty' | 'status' | 'joinedDate' | 'createdAt' | 'updatedAt';
  sortDirection: 'asc' | 'desc';
  statuses: EntityActivityStatus[];
  clinicId?: string | undefined;
}

export interface DoctorWritePayload {
  lookupId?: string | undefined;
  name: string;
  specialty: string;
  clinicId: string;
  email: string;
  phone: string;
  status: EntityActivityStatus;
  joinedDate: Date;
  avatar: string;
}

export interface DoctorUpdatePayload {
  lookupId?: string | undefined;
  name?: string | undefined;
  specialty?: string | undefined;
  clinicId?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  status?: EntityActivityStatus | undefined;
  joinedDate?: Date | undefined;
  avatar?: string | undefined;
}

export const DOCTOR_STATUSES = ENTITY_ACTIVITY_STATUSES;
