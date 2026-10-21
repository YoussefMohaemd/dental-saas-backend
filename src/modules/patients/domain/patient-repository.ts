import { type Patient, type PatientListQuery, type PatientUpdatePayload, type PatientWritePayload } from './patient';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export interface PatientListResult {
  items: Patient[];
  totalItems: number;
}

export interface DoctorReference {
  id: string;
  name: string;
  clinicId: string;
}

export interface PatientRepository {
  create(payload: PatientWritePayload): Promise<Patient>;
  findById(patientId: string, scope?: DataVisibilityScope): Promise<Patient | null>;
  list(query: PatientListQuery): Promise<PatientListResult>;
  update(patientId: string, payload: PatientUpdatePayload, scope?: DataVisibilityScope): Promise<Patient | null>;
  delete(patientId: string, scope?: DataVisibilityScope): Promise<boolean>;
  clinicExists(clinicId: string): Promise<boolean>;
  findDoctorById(doctorId: string): Promise<DoctorReference | null>;
  findClinicNameById(clinicId: string): Promise<string | null>;
  findDoctorNameById(doctorId: string): Promise<string | null>;
  countOrders(patientId: string): Promise<number>;
}
