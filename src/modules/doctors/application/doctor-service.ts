import {
  buildPaginationMeta,
  type PaginatedResult,
  type PaginationQuery,
} from '../../../shared/application/contracts/pagination';
import { type DoctorDto } from '../../../shared/application/contracts/dental-api-contract';
import { DOMAIN_ERROR_CODES, DomainError } from '../../../shared/domain/errors/domain-error';
import {
  type Doctor,
  type DoctorListQuery,
  type DoctorUpdatePayload,
  type DoctorWritePayload,
} from '../domain/doctor';
import { type DoctorRepository } from '../domain/doctor-repository';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export class DoctorService {
  public constructor(private readonly doctorRepository: DoctorRepository) {}

  public async createDoctor(payload: DoctorWritePayload, scope: DataVisibilityScope): Promise<DoctorDto> {
    await this.ensureClinicExists(payload.clinicId, scope);
    await this.ensureUniqueEmail(payload.email, scope);
    await this.ensureUniqueLookupId(payload.lookupId, scope);
    const doctor = await this.doctorRepository.create(payload, scope);
    return this.toDoctorDto(doctor, scope);
  }

  public async getDoctorById(doctorId: string, scope: DataVisibilityScope): Promise<DoctorDto> {
    const doctor = await this.doctorRepository.findById(doctorId, scope);
    if (doctor === null) {
      throw new DomainError(
        `Doctor ${doctorId} was not found`,
        DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND,
      );
    }

    return this.toDoctorDto(doctor, scope);
  }

  public async listDoctors(
    query: Omit<DoctorListQuery, 'page' | 'pageSize'>,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<DoctorDto>> {
    const result = await this.doctorRepository.list({
      ...query,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    const items = await Promise.all(result.items.map((item) => this.toDoctorDto(item, query.scope)));

    return {
      items,
      meta: buildPaginationMeta(result.totalItems, pagination),
    };
  }

  public async updateDoctor(
    doctorId: string,
    payload: DoctorUpdatePayload,
    scope: DataVisibilityScope,
  ): Promise<DoctorDto> {
    if (payload.clinicId !== undefined) {
      await this.ensureClinicExists(payload.clinicId, scope);
    }
    if (payload.email !== undefined) {
      await this.ensureUniqueEmail(payload.email, scope, doctorId);
    }
    if (payload.lookupId !== undefined && payload.lookupId.length > 0) {
      await this.ensureUniqueLookupId(payload.lookupId, scope, doctorId);
    }

    const updated = await this.doctorRepository.update(doctorId, payload, scope);
    if (updated === null) {
      throw new DomainError(
        `Doctor ${doctorId} was not found`,
        DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND,
      );
    }

    return this.toDoctorDto(updated, scope);
  }

  public async deleteDoctor(doctorId: string, scope: DataVisibilityScope): Promise<void> {
    const existing = await this.doctorRepository.findById(doctorId, scope);
    if (existing === null) {
      throw new DomainError(
        `Doctor ${doctorId} was not found`,
        DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND,
      );
    }

    const hasPatients = await this.doctorRepository.hasPatients(doctorId, scope);
    if (hasPatients) {
      throw new DomainError(
        'Doctor cannot be deleted while patients are linked',
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
      );
    }

    await this.doctorRepository.delete(doctorId, scope);
  }

  private async ensureClinicExists(clinicId: string, scope: DataVisibilityScope): Promise<void> {
    const clinicExists = await this.doctorRepository.clinicExists(clinicId, scope);
    if (!clinicExists) {
      throw new DomainError(
        `Clinic ${clinicId} does not exist`,
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        { field: 'clinicId' },
      );
    }
  }

  private async ensureUniqueEmail(
    email: string,
    scope: DataVisibilityScope,
    excludeDoctorId?: string,
  ): Promise<void> {
    const exists = await this.doctorRepository.existsByEmail(email, scope, excludeDoctorId);
    if (exists) {
      throw new DomainError(
        `Doctor email '${email}' already exists`,
        DOMAIN_ERROR_CODES.ENTITY_CONFLICT,
        { field: 'email' },
      );
    }
  }

  private async ensureUniqueLookupId(
    lookupId: string | undefined,
    scope: DataVisibilityScope,
    excludeDoctorId?: string,
  ): Promise<void> {
    if (lookupId === undefined || lookupId.length === 0) {
      return;
    }

    const exists = await this.doctorRepository.existsByLookupId(lookupId, scope, excludeDoctorId);
    if (exists) {
      throw new DomainError(
        `Doctor lookupId '${lookupId}' already exists`,
        DOMAIN_ERROR_CODES.ENTITY_CONFLICT,
        { field: 'lookupId' },
      );
    }
  }

  private async toDoctorDto(doctor: Doctor, scope: DataVisibilityScope): Promise<DoctorDto> {
    const [clinicName, ordersCount] = await Promise.all([
      this.doctorRepository.findClinicNameById(doctor.clinicId, scope),
      this.doctorRepository.countOrders(doctor.id, scope),
    ]);

    if (clinicName === null) {
      throw new ApplicationError({
        message: `Clinic ${doctor.clinicId} linked to doctor ${doctor.id} was not found`,
        statusCode: 500,
        code: APPLICATION_ERROR_CODES.INTERNAL_ERROR,
      });
    }

    return {
      id: doctor.id,
      ...(doctor.lookupId !== undefined ? { lookupId: doctor.lookupId } : {}),
      name: doctor.name,
      gender: doctor.gender ?? 'M',
      specialty: doctor.specialty,
      clinicId: doctor.clinicId,
      clinicName,
      email: doctor.email,
      phone: doctor.phone,
      status: doctor.status,
      ordersCount,
      joinedDate: doctor.joinedDate.toISOString(),
      avatar: doctor.avatar,
    };
  }
}

export function ensureNonEmptyDoctorUpdate<TPayload extends Record<string, unknown>>(
  payload: TPayload,
): void {
  if (Object.keys(payload).length === 0) {
    throw new ApplicationError({
      message: 'At least one field must be provided for update',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }
}
