import { type Clinic, type ClinicListQuery, type ClinicUpdatePayload, type ClinicWritePayload } from './clinic';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export interface ClinicListResult {
  items: Clinic[];
  totalItems: number;
}

export interface ClinicRepository {
  create(payload: ClinicWritePayload, scope: DataVisibilityScope): Promise<Clinic>;
  findById(clinicId: string, scope: DataVisibilityScope): Promise<Clinic | null>;
  list(query: ClinicListQuery): Promise<ClinicListResult>;
  update(clinicId: string, payload: ClinicUpdatePayload, scope: DataVisibilityScope): Promise<Clinic | null>;
  delete(clinicId: string, scope: DataVisibilityScope): Promise<boolean>;
  existsByName(name: string, scope: DataVisibilityScope, excludeClinicId?: string): Promise<boolean>;
  hasDoctors(clinicId: string, scope: DataVisibilityScope): Promise<boolean>;
  hasPatients(clinicId: string, scope: DataVisibilityScope): Promise<boolean>;
  countDoctors(clinicId: string, scope: DataVisibilityScope): Promise<number>;
  countPatients(clinicId: string, scope: DataVisibilityScope): Promise<number>;
  countOrders(clinicId: string, scope: DataVisibilityScope): Promise<number>;
}
