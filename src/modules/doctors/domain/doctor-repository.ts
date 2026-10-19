import { type Doctor, type DoctorListQuery, type DoctorUpdatePayload, type DoctorWritePayload } from './doctor';

export interface DoctorListResult {
  items: Doctor[];
  totalItems: number;
}

export interface DoctorRepository {
  create(payload: DoctorWritePayload): Promise<Doctor>;
  findById(doctorId: string): Promise<Doctor | null>;
  list(query: DoctorListQuery): Promise<DoctorListResult>;
  update(doctorId: string, payload: DoctorUpdatePayload): Promise<Doctor | null>;
  delete(doctorId: string): Promise<boolean>;
  existsByEmail(email: string, excludeDoctorId?: string): Promise<boolean>;
  existsByLookupId(lookupId: string, excludeDoctorId?: string): Promise<boolean>;
  clinicExists(clinicId: string): Promise<boolean>;
  findClinicNameById(clinicId: string): Promise<string | null>;
  hasPatients(doctorId: string): Promise<boolean>;
  countOrders(doctorId: string): Promise<number>;
}

