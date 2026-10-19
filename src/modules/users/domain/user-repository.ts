import { type User, type UserCreatePayload, type UserListQuery, type UserRoleStatusUpdatePayload } from './user';

export interface UserListResult {
  items: User[];
  totalItems: number;
}

export interface UserRepository {
  create(payload: UserCreatePayload): Promise<User>;
  findById(tenantId: string, userId: string): Promise<User | null>;
  findByEmail(tenantId: string, email: string): Promise<User | null>;
  list(tenantId: string, query: UserListQuery): Promise<UserListResult>;
  updateRoleStatus(
    tenantId: string,
    userId: string,
    payload: UserRoleStatusUpdatePayload,
    options?: { bumpTokenVersion?: boolean },
  ): Promise<User | null>;
  setStatus(
    tenantId: string,
    userId: string,
    status: User['status'],
    options?: { bumpTokenVersion?: boolean },
  ): Promise<User | null>;
  revokeActiveSessions(tenantId: string, userId: string): Promise<void>;
}
