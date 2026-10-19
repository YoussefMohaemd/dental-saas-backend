import { type Clinic, type ClinicListQuery, type ClinicUpdatePayload, type ClinicWritePayload } from './clinic';

export interface ClinicListResult {
  items: Clinic[];
  totalItems: number;
}

export interface ClinicRepository {
  create(payload: ClinicWritePayload): Promise<Clinic>;
  findById(clinicId: string): Promise<Clinic | null>;
  list(query: ClinicListQuery): Promise<ClinicListResult>;
  update(clinicId: string, payload: ClinicUpdatePayload): Promise<Clinic | null>;
  delete(clinicId: string): Promise<boolean>;
  existsByName(name: string, excludeClinicId?: string): Promise<boolean>;
  hasDoctors(clinicId: string): Promise<boolean>;
  hasPatients(clinicId: string): Promise<boolean>;
  countDoctors(clinicId: string): Promise<number>;
  countPatients(clinicId: string): Promise<number>;
  countOrders(clinicId: string): Promise<number>;
}

