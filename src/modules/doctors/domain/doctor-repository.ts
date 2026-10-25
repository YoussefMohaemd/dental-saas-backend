import { type Doctor, type DoctorListQuery, type DoctorUpdatePayload, type DoctorWritePayload } from './doctor';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export interface DoctorListResult {
  items: Doctor[];
  totalItems: number;
}

export interface DoctorRepository {
  create(payload: DoctorWritePayload, scope: DataVisibilityScope): Promise<Doctor>;
  findById(doctorId: string, scope: DataVisibilityScope): Promise<Doctor | null>;
  list(query: DoctorListQuery): Promise<DoctorListResult>;
  update(doctorId: string, payload: DoctorUpdatePayload, scope: DataVisibilityScope): Promise<Doctor | null>;
  delete(doctorId: string, scope: DataVisibilityScope): Promise<boolean>;
  existsByEmail(email: string, scope: DataVisibilityScope, excludeDoctorId?: string): Promise<boolean>;
  existsByLookupId(lookupId: string, scope: DataVisibilityScope, excludeDoctorId?: string): Promise<boolean>;
  clinicExists(clinicId: string, scope: DataVisibilityScope): Promise<boolean>;
  findClinicNameById(clinicId: string, scope: DataVisibilityScope): Promise<string | null>;
  hasPatients(doctorId: string, scope: DataVisibilityScope): Promise<boolean>;
  countOrders(doctorId: string, scope: DataVisibilityScope): Promise<number>;
}
