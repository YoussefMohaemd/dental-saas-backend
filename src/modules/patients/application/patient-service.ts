import { buildPaginationMeta, type PaginatedResult, type PaginationQuery } from '../../../shared/application/contracts/pagination';
import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';
import { type PatientDto } from '../../../shared/application/contracts/dental-api-contract';
import { DOMAIN_ERROR_CODES, DomainError } from '../../../shared/domain/errors/domain-error';
import { type Patient, type PatientListQuery, type PatientUpdatePayload, type PatientWritePayload } from '../domain/patient';
import { type PatientRepository } from '../domain/patient-repository';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export class PatientService {
  public constructor(private readonly patientRepository: PatientRepository) {}

  public async createPatient(payload: PatientWritePayload, scope: DataVisibilityScope): Promise<PatientDto> {
    await this.assertClinicDoctorLink(payload.clinicId, payload.doctorId, scope);
    const patient = await this.patientRepository.create(payload, scope);
    return this.toPatientDto(patient, scope);
  }

  public async getPatientById(patientId: string, scope: DataVisibilityScope): Promise<PatientDto> {
    const patient = await this.patientRepository.findById(patientId, scope);
    if (patient === null) {
      throw new DomainError(`Patient ${patientId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    return this.toPatientDto(patient, scope);
  }

  public async listPatients(
    query: Omit<PatientListQuery, 'page' | 'pageSize'>,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<PatientDto>> {
    const result = await this.patientRepository.list({
      ...query,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    const items = await Promise.all(result.items.map((item) => this.toPatientDto(item, query.scope)));

    return {
      items,
      meta: buildPaginationMeta(result.totalItems, pagination),
    };
  }

  public async updatePatient(
    patientId: string,
    payload: PatientUpdatePayload,
    scope: DataVisibilityScope,
  ): Promise<PatientDto> {
    if (payload.clinicId !== undefined || payload.doctorId !== undefined) {
      const existing = await this.patientRepository.findById(patientId, scope);
      if (existing === null) {
        throw new DomainError(`Patient ${patientId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
      }

      const clinicId = payload.clinicId ?? existing.clinicId;
      const doctorId = payload.doctorId ?? existing.doctorId;
      await this.assertClinicDoctorLink(clinicId, doctorId, scope);
    }

    const updated = await this.patientRepository.update(patientId, payload, scope);
    if (updated === null) {
      throw new DomainError(`Patient ${patientId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    return this.toPatientDto(updated, scope);
  }

  public async deletePatient(patientId: string, scope: DataVisibilityScope): Promise<void> {
    const deleted = await this.patientRepository.delete(patientId, scope);
    if (!deleted) {
      throw new DomainError(`Patient ${patientId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }
  }

  private async assertClinicDoctorLink(
    clinicId: string,
    doctorId: string,
    scope: DataVisibilityScope,
  ): Promise<void> {
    const [clinicExists, doctor] = await Promise.all([
      this.patientRepository.clinicExists(clinicId, scope),
      this.patientRepository.findDoctorById(doctorId, scope),
    ]);

    if (!clinicExists) {
      throw new DomainError(
        `Clinic ${clinicId} does not exist`,
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        { field: 'clinicId' },
      );
    }

    if (doctor === null) {
      throw new DomainError(
        `Doctor ${doctorId} does not exist`,
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        { field: 'doctorId' },
      );
    }

    if (doctor.clinicId !== clinicId) {
      throw new DomainError(
        'Doctor must belong to the selected clinic',
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        { clinicId, doctorId },
      );
    }
  }

  private async toPatientDto(patient: Patient, scope: DataVisibilityScope): Promise<PatientDto> {
    const [clinicName, doctorName, ordersCount] = await Promise.all([
      this.patientRepository.findClinicNameById(patient.clinicId, scope),
      this.patientRepository.findDoctorNameById(patient.doctorId, scope),
      this.patientRepository.countOrders(patient.id, scope),
    ]);

    if (clinicName === null || doctorName === null) {
      throw new ApplicationError({
        message: `Patient ${patient.id} has invalid clinic or doctor linkage`,
        statusCode: 500,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      });
    }

    return {
      id: patient.id,
      name: patient.name,
      dob: patient.dob.toISOString(),
      gender: patient.gender,
      phone: patient.phone,
      email: patient.email,
      clinicId: patient.clinicId,
      clinicName,
      doctorId: patient.doctorId,
      doctorName,
      status: patient.status,
      ordersCount,
      lastVisit: patient.lastVisit.toISOString(),
    };
  }
}

export function ensureNonEmptyPatientUpdate<TPayload extends Record<string, unknown>>(payload: TPayload): void {
  if (Object.keys(payload).length === 0) {
    throw new ApplicationError({
      message: 'At least one field must be provided for update',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }
}
