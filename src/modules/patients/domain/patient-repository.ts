import { type Patient, type PatientListQuery, type PatientUpdatePayload, type PatientWritePayload } from './patient';

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
  findById(patientId: string): Promise<Patient | null>;
  list(query: PatientListQuery): Promise<PatientListResult>;
  update(patientId: string, payload: PatientUpdatePayload): Promise<Patient | null>;
  delete(patientId: string): Promise<boolean>;
  clinicExists(clinicId: string): Promise<boolean>;
  findDoctorById(doctorId: string): Promise<DoctorReference | null>;
  findClinicNameById(clinicId: string): Promise<string | null>;
  findDoctorNameById(doctorId: string): Promise<string | null>;
  countOrders(patientId: string): Promise<number>;
}

