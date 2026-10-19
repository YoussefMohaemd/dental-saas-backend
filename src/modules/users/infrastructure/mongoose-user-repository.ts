import { type FilterQuery, type Model, type SortOrder, Types } from 'mongoose';

import { AuthSessionModel } from '../../../shared/infrastructure/persistence/mongoose/models/auth-session.model';
import { UserModel } from '../../../shared/infrastructure/persistence/mongoose/models/user.model';
import { type User, type UserCreatePayload, type UserListQuery, type UserRoleStatusUpdatePayload } from '../domain/user';
import { type UserListResult, type UserRepository } from '../domain/user-repository';

const userSortFields: Record<UserListQuery['sortBy'], string> = {
  fullName: 'fullName',
  email: 'email',
  status: 'status',
  lastLoginAt: 'lastLoginAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export class MongooseUserRepository implements UserRepository {
  public async create(payload: UserCreatePayload): Promise<User> {
    const created = await userModel.create({
      tenantId: payload.tenantId,
      fullName: payload.fullName,
      email: payload.email,
      roles: payload.roles,
      clinicId: payload.clinicId,
      avatarUrl: payload.avatarUrl,
      status: payload.status,
      passwordHash: payload.passwordHash,
    });

    return this.toUser(created.toObject());
  }

  public async findById(tenantId: string, userId: string): Promise<User | null> {
    const found = await userModel.findOne({ _id: userId, tenantId })
      .lean<UserRecord | null>()
      .exec();

    return found === null ? null : this.toUser(found);
  }

  public async findByEmail(tenantId: string, email: string): Promise<User | null> {
    const found = await userModel.findOne({ tenantId, email })
      .lean<UserRecord | null>()
      .exec();

    return found === null ? null : this.toUser(found);
  }

  public async list(tenantId: string, query: UserListQuery): Promise<UserListResult> {
    const filter: FilterQuery<UserRecord> = {
      tenantId: toObjectId(tenantId),
      ...(query.search !== undefined
        ? {
            $or: [
              { fullName: new RegExp(escapeRegExp(query.search), 'i') },
              { email: new RegExp(escapeRegExp(query.search), 'i') },
            ],
          }
        : {}),
      ...(query.statuses.length > 0 ? { status: { $in: query.statuses } } : {}),
      ...(query.role !== undefined ? { roles: query.role } : {}),
    };

    const sortBy = userSortFields[query.sortBy];
    const sortValue: SortOrder = query.sortDirection === 'asc' ? 1 : -1;
    const skip = (query.page - 1) * query.pageSize;

    const [items, totalItems] = await Promise.all([
      userModel.find(filter)
        .sort({ [sortBy]: sortValue })
        .skip(skip)
        .limit(query.pageSize)
        .lean<UserRecord[]>()
        .exec(),
      userModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((item) => this.toUser(item)),
      totalItems,
    };
  }

  public async updateRoleStatus(
    tenantId: string,
    userId: string,
    payload: UserRoleStatusUpdatePayload,
    options?: { bumpTokenVersion?: boolean },
  ): Promise<User | null> {
    const setPayload = {
      ...(payload.roles !== undefined ? { roles: payload.roles } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
    };
    const updateDocument = {
      ...(Object.keys(setPayload).length > 0 ? { $set: setPayload } : {}),
      ...(options?.bumpTokenVersion === true ? { $inc: { tokenVersion: 1 } } : {}),
    };

    const updated = await userModel.findOneAndUpdate(
      { _id: userId, tenantId },
      updateDocument,
      { new: true },
    )
      .lean<UserRecord | null>()
      .exec();

    return updated === null ? null : this.toUser(updated);
  }

  public async setStatus(
    tenantId: string,
    userId: string,
    status: User['status'],
    options?: { bumpTokenVersion?: boolean },
  ): Promise<User | null> {
    const updateDocument = {
      $set: { status },
      ...(options?.bumpTokenVersion === true ? { $inc: { tokenVersion: 1 } } : {}),
    };

    const updated = await userModel.findOneAndUpdate(
      { _id: userId, tenantId },
      updateDocument,
      { new: true },
    )
      .lean<UserRecord | null>()
      .exec();

    return updated === null ? null : this.toUser(updated);
  }

  public async revokeActiveSessions(tenantId: string, userId: string): Promise<void> {
    await authSessionModel.updateMany(
      {
        userId,
        tenantId,
        revokedAt: { $exists: false },
      },
      {
        $set: { revokedAt: new Date() },
      },
    ).exec();
  }

  private toUser(document: UserRecord): User {
    return {
      id: document._id.toString(),
      tenantId: document.tenantId.toString(),
      fullName: document.fullName,
      email: document.email,
      roles: document.roles.map((role) => role.trim().toLowerCase()),
      ...(document.clinicId !== undefined ? { clinicId: document.clinicId.toString() } : {}),
      ...(document.avatarUrl !== undefined ? { avatarUrl: document.avatarUrl } : {}),
      status: document.status,
      ...(document.lastLoginAt !== undefined ? { lastLoginAt: document.lastLoginAt } : {}),
      tokenVersion: document.tokenVersion,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}

interface UserRecord {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  fullName: string;
  email: string;
  roles: string[];
  clinicId?: Types.ObjectId | undefined;
  avatarUrl?: string | undefined;
  status: User['status'];
  lastLoginAt?: Date | undefined;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const userModel = UserModel as unknown as Model<UserRecord>;
const authSessionModel = AuthSessionModel as unknown as Model<{
  userId: Types.ObjectId;
  tenantId: Types.ObjectId;
  revokedAt?: Date;
}>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}
