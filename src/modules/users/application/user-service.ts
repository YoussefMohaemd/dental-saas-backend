import { buildPaginationMeta, type PaginatedResult, type PaginationQuery } from '../../../shared/application/contracts/pagination';
import { type UserDto } from '../../../shared/application/contracts/dental-api-contract';
import { DOMAIN_ERROR_CODES, DomainError } from '../../../shared/domain/errors/domain-error';
import { PasswordHasher } from '../../auth/application/password-hasher';
import {
  type SupportedUserRole,
  type User,
  type UserCreatePayload,
  type UserListQuery,
  type UserRoleStatusUpdatePayload,
} from '../domain/user';
import { type UserRepository } from '../domain/user-repository';

interface UserCreateInput {
  fullName: string;
  email: string;
  roles: SupportedUserRole[];
  status: User['status'];
  clinicId?: string | undefined;
  avatarUrl?: string | undefined;
  password?: string | undefined;
}

export class UserService {
  private readonly passwordHasher: PasswordHasher;

  public constructor(private readonly userRepository: UserRepository, passwordHasher?: PasswordHasher) {
    this.passwordHasher = passwordHasher ?? new PasswordHasher();
  }

  public async listUsers(
    tenantId: string,
    query: Omit<UserListQuery, 'page' | 'pageSize'>,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<UserDto>> {
    const result = await this.userRepository.list(tenantId, {
      ...query,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    return {
      items: result.items.map((item) => this.toUserDto(item)),
      meta: buildPaginationMeta(result.totalItems, pagination),
    };
  }

  public async getUserById(tenantId: string, userId: string): Promise<UserDto> {
    const user = await this.userRepository.findById(tenantId, userId);
    if (user === null) {
      throw new DomainError(`User ${userId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    return this.toUserDto(user);
  }

  public async createUser(tenantId: string, payload: UserCreateInput): Promise<UserDto> {
    const normalizedRoles = normalizeRoles(payload.roles);

    if (payload.status === 'active' && payload.password === undefined) {
      throw new DomainError(
        'Active users must have an initial password',
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        { field: 'password' },
      );
    }

    const existing = await this.userRepository.findByEmail(tenantId, payload.email);
    if (existing !== null) {
      throw new DomainError(
        `User email '${payload.email}' already exists`,
        DOMAIN_ERROR_CODES.ENTITY_CONFLICT,
        { field: 'email' },
      );
    }

    const passwordHash = payload.password === undefined
      ? undefined
      : await this.passwordHasher.hash(payload.password);

    const created = await this.userRepository.create({
      tenantId,
      fullName: payload.fullName,
      email: payload.email,
      roles: normalizedRoles,
      status: payload.status,
      clinicId: payload.clinicId,
      avatarUrl: payload.avatarUrl,
      passwordHash,
    } satisfies UserCreatePayload);

    return this.toUserDto(created);
  }

  public async updateUserRoleStatus(
    tenantId: string,
    userId: string,
    payload: UserRoleStatusUpdatePayload,
    actorUserId: string,
  ): Promise<UserDto> {
    const existing = await this.userRepository.findById(tenantId, userId);
    if (existing === null) {
      throw new DomainError(`User ${userId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    const normalizedRoles = payload.roles === undefined ? undefined : normalizeRoles(payload.roles);

    if (actorUserId === userId) {
      if (payload.status !== undefined && payload.status !== 'active') {
        throw new DomainError(
          'You cannot deactivate your own account',
          DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        );
      }

      if (
        normalizedRoles !== undefined
        && existing.roles.some((role) => role === 'admin')
        && !normalizedRoles.includes('admin')
      ) {
        throw new DomainError(
          'You cannot remove your own admin role',
          DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        );
      }
    }

    const updated = await this.userRepository.updateRoleStatus(
      tenantId,
      userId,
      {
        ...(normalizedRoles !== undefined ? { roles: normalizedRoles } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
      },
      { bumpTokenVersion: true },
    );

    if (updated === null) {
      throw new DomainError(`User ${userId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    await this.userRepository.revokeActiveSessions(tenantId, userId);
    return this.toUserDto(updated);
  }

  public async deactivateUser(tenantId: string, userId: string, actorUserId: string): Promise<UserDto> {
    if (actorUserId === userId) {
      throw new DomainError(
        'You cannot deactivate your own account',
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
      );
    }

    const updated = await this.userRepository.setStatus(
      tenantId,
      userId,
      'disabled',
      { bumpTokenVersion: true },
    );
    if (updated === null) {
      throw new DomainError(`User ${userId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    await this.userRepository.revokeActiveSessions(tenantId, userId);
    return this.toUserDto(updated);
  }

  public async reactivateUser(tenantId: string, userId: string): Promise<UserDto> {
    const updated = await this.userRepository.setStatus(
      tenantId,
      userId,
      'active',
      { bumpTokenVersion: true },
    );
    if (updated === null) {
      throw new DomainError(`User ${userId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    await this.userRepository.revokeActiveSessions(tenantId, userId);
    return this.toUserDto(updated);
  }

  private toUserDto(user: User): UserDto {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      roles: user.roles,
      ...(user.clinicId !== undefined ? { clinicId: user.clinicId } : {}),
      ...(user.avatarUrl !== undefined ? { avatarUrl: user.avatarUrl } : {}),
      status: user.status,
      ...(user.lastLoginAt !== undefined ? { lastLoginAt: user.lastLoginAt.toISOString() } : {}),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}

function normalizeRoles(roles: SupportedUserRole[]): SupportedUserRole[] {
  return Array.from(new Set(roles.map((role) => role.trim().toLowerCase() as SupportedUserRole)));
}
