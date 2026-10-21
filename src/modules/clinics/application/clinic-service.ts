import { buildPaginationMeta, type PaginatedResult, type PaginationQuery } from '../../../shared/application/contracts/pagination';
import { type ClinicDto } from '../../../shared/application/contracts/dental-api-contract';
import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';
import { DOMAIN_ERROR_CODES, DomainError } from '../../../shared/domain/errors/domain-error';
import { type Clinic, type ClinicListQuery, type ClinicUpdatePayload, type ClinicWritePayload } from '../domain/clinic';
import { type ClinicRepository } from '../domain/clinic-repository';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export class ClinicService {
  public constructor(private readonly clinicRepository: ClinicRepository) {}

  public async createClinic(payload: ClinicWritePayload): Promise<ClinicDto> {
    await this.ensureUniqueName(payload.name);
    const clinic = await this.clinicRepository.create(payload);
    return this.toClinicDto(clinic);
  }

  public async getClinicById(clinicId: string, scope?: DataVisibilityScope): Promise<ClinicDto> {
    const clinic = await this.clinicRepository.findById(clinicId, scope);
    if (clinic === null) {
      throw new DomainError(`Clinic ${clinicId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    return this.toClinicDto(clinic);
  }

  public async listClinics(
    query: Omit<ClinicListQuery, 'page' | 'pageSize'>,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<ClinicDto>> {
    const result = await this.clinicRepository.list({
      ...query,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    const items = await Promise.all(result.items.map((item) => this.toClinicDto(item)));

    return {
      items,
      meta: buildPaginationMeta(result.totalItems, pagination),
    };
  }

  public async updateClinic(
    clinicId: string,
    payload: ClinicUpdatePayload,
    scope?: DataVisibilityScope,
  ): Promise<ClinicDto> {
    if (payload.name !== undefined) {
      await this.ensureUniqueName(payload.name, clinicId);
    }

    const updated = await this.clinicRepository.update(clinicId, payload, scope);
    if (updated === null) {
      throw new DomainError(`Clinic ${clinicId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    return this.toClinicDto(updated);
  }

  public async deleteClinic(clinicId: string, scope?: DataVisibilityScope): Promise<void> {
    const existing = await this.clinicRepository.findById(clinicId, scope);
    if (existing === null) {
      throw new DomainError(`Clinic ${clinicId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    const [hasDoctors, hasPatients] = await Promise.all([
      this.clinicRepository.hasDoctors(clinicId),
      this.clinicRepository.hasPatients(clinicId),
    ]);

    if (hasDoctors || hasPatients) {
      throw new DomainError(
        'Clinic cannot be deleted while doctors or patients are still linked',
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
      );
    }

    await this.clinicRepository.delete(clinicId, scope);
  }

  private async ensureUniqueName(name: string, clinicIdToExclude?: string): Promise<void> {
    const isUsed = await this.clinicRepository.existsByName(name, clinicIdToExclude);
    if (isUsed) {
      throw new DomainError(
        `Clinic name '${name}' already exists`,
        DOMAIN_ERROR_CODES.ENTITY_CONFLICT,
        { field: 'name' },
      );
    }
  }

  private async toClinicDto(clinic: Clinic): Promise<ClinicDto> {
    const [doctorsCount, patientsCount, ordersCount] = await Promise.all([
      this.clinicRepository.countDoctors(clinic.id),
      this.clinicRepository.countPatients(clinic.id),
      this.clinicRepository.countOrders(clinic.id),
    ]);

    return {
      id: clinic.id,
      name: clinic.name,
      address: clinic.address,
      city: clinic.city,
      phone: clinic.phone,
      email: clinic.email,
      doctorsCount,
      patientsCount,
      ordersCount,
      status: clinic.status,
      accountManager: clinic.accountManager,
    };
  }
}

export function ensureNonEmptyUpdate<TPayload extends Record<string, unknown>>(payload: TPayload): void {
  if (Object.keys(payload).length === 0) {
    throw new ApplicationError({
      message: 'At least one field must be provided for update',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }
}
