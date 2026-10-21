import { ENTITY_ACTIVITY_STATUSES, type EntityActivityStatus } from '../../../shared/domain/entities/dental-data-model';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export interface Patient {
  id: string;
  name: string;
  dob: Date;
  gender: 'M' | 'F';
  phone: string;
  email: string;
  clinicId: string;
  doctorId: string;
  status: EntityActivityStatus;
  lastVisit: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientListQuery {
  scope?: DataVisibilityScope;
  search?: string | undefined;
  page: number;
  pageSize: number;
  sortBy: 'name' | 'dob' | 'gender' | 'status' | 'lastVisit' | 'createdAt' | 'updatedAt';
  sortDirection: 'asc' | 'desc';
  statuses: EntityActivityStatus[];
}

export interface PatientWritePayload {
  name: string;
  dob: Date;
  gender: 'M' | 'F';
  phone: string;
  email: string;
  clinicId: string;
  doctorId: string;
  status: EntityActivityStatus;
  lastVisit: Date;
}

export interface PatientUpdatePayload {
  name?: string | undefined;
  dob?: Date | undefined;
  gender?: 'M' | 'F' | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  clinicId?: string | undefined;
  doctorId?: string | undefined;
  status?: EntityActivityStatus | undefined;
  lastVisit?: Date | undefined;
}

export const PATIENT_STATUSES = ENTITY_ACTIVITY_STATUSES;
