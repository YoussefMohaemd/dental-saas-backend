import type { FilterQuery, SortOrder, Types } from 'mongoose';

import { type NotificationDto } from '../../../shared/application/contracts/dental-api-contract';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { buildPaginationMeta, type PaginationQuery } from '../../../shared/application/contracts/pagination';
import { NOTIFICATION_TYPES } from '../../../shared/domain/entities/dental-data-model';
import { NotificationModel } from '../../../shared/infrastructure/persistence/mongoose/models/notification.model';
import { parseEnumList } from '../../../shared/presentation/http/http-utils';

interface NotificationRecord {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  recipientId: Types.ObjectId;
  type: NotificationDto['type'];
  title: string;
  message: string;
  read: boolean;
  relatedId?: Types.ObjectId;
  relatedType?: string;
  createdAt: Date;
}

export function parseNotificationTypeFilters(
  value: unknown,
): NotificationDto['type'][] | undefined {
  return parseEnumList(value, NOTIFICATION_TYPES);
}

export async function listNotifications(input: {
  pagination: PaginationQuery;
  search?: string | undefined;
  types?: NotificationDto['type'][] | undefined;
  read?: boolean | undefined;
  sortBy: 'createdAt' | 'type' | 'read' | 'title';
  sortDirection: 'asc' | 'desc';
  tenantId?: Types.ObjectId | undefined;
  recipientId?: Types.ObjectId | undefined;
}): Promise<{ items: NotificationDto[]; totalItems: number }> {
  const filter: FilterQuery<NotificationRecord> = {};
  if (input.tenantId) {
    filter.tenantId = input.tenantId;
  }
  if (input.recipientId) {
    filter.recipientId = input.recipientId;
  }
  if (input.types && input.types.length > 0) {
    filter.type = { $in: input.types };
  }
  if (input.read !== undefined) {
    filter.read = input.read;
  }
  if (input.search) {
    const searchRegex = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [{ title: searchRegex }, { message: searchRegex }];
  }

  const totalItems = await NotificationModel.countDocuments(filter);
  const sort: Record<string, SortOrder> = {
    [input.sortBy]: input.sortDirection === 'asc' ? 1 : -1,
  };
  const records: NotificationRecord[] = await NotificationModel.find(filter)
    .sort(sort)
    .skip((input.pagination.page - 1) * input.pagination.pageSize)
    .limit(input.pagination.pageSize)
    .lean<NotificationRecord[]>()
    .exec();

  return {
    items: records.map((record) => toNotificationDto(record)),
    totalItems,
  };
}

export async function markNotificationRead(
  notificationId: Types.ObjectId,
  tenantId?: Types.ObjectId,
  recipientId?: Types.ObjectId,
): Promise<NotificationDto> {
  const filter: FilterQuery<NotificationRecord> = { _id: notificationId };
  if (tenantId) {
    filter.tenantId = tenantId;
  }
  if (recipientId) {
    filter.recipientId = recipientId;
  }

  const record = await NotificationModel.findOneAndUpdate(
    filter,
    { read: true },
    { new: true, runValidators: true },
  )
    .lean<NotificationRecord | null>()
    .exec();

  if (!record) {
    throw new ApplicationError({
      message: 'Notification not found',
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  return toNotificationDto(record);
}

export async function markAllNotificationsRead(input: {
  tenantId?: Types.ObjectId | undefined;
  recipientId?: Types.ObjectId | undefined;
}): Promise<{ updatedCount: number }> {
  const filter: FilterQuery<NotificationRecord> = { read: false };
  if (input.tenantId) {
    filter.tenantId = input.tenantId;
  }
  if (input.recipientId) {
    filter.recipientId = input.recipientId;
  }

  const result = await NotificationModel.updateMany(filter, { read: true }).exec();
  return {
    updatedCount: result.modifiedCount,
  };
}

export { buildPaginationMeta };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toNotificationDto(record: NotificationRecord): NotificationDto {
  return {
    id: record._id.toString(),
    type: record.type,
    title: record.title,
    message: record.message,
    read: record.read,
    createdAt: record.createdAt.toISOString(),
    ...(record.relatedId ? { relatedId: record.relatedId.toString() } : {}),
    ...(record.relatedType ? { relatedType: record.relatedType } : {}),
  };
}
