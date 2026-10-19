import {
  PRIORITIES,
  SUB_ORDER_STATUSES,
  type Priority,
  type SubOrderCreationDataEntity,
  type SubOrderStatus,
} from '../../../shared/domain/entities/dental-data-model';

export interface SubOrder {
  id: string;
  orderId: string;
  service: string;
  icon: string;
  status: SubOrderStatus;
  formsComplete: number;
  formsTotal: number;
  scansComplete: number;
  scansTotal: number;
  teeth: number[];
  priority: Priority;
  dueDate: Date;
  notes: string;
  creationData?: SubOrderCreationDataEntity | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubOrderWritePayload {
  service: string;
  icon: string;
  status: SubOrderStatus;
  formsComplete: number;
  formsTotal: number;
  scansComplete: number;
  scansTotal: number;
  teeth: number[];
  priority: Priority;
  dueDate: Date;
  notes: string;
  creationData?: SubOrderCreationDataEntity | undefined;
}

export interface SubOrderUpdatePayload {
  service?: string | undefined;
  icon?: string | undefined;
  status?: SubOrderStatus | undefined;
  formsComplete?: number | undefined;
  formsTotal?: number | undefined;
  scansComplete?: number | undefined;
  scansTotal?: number | undefined;
  teeth?: number[] | undefined;
  priority?: Priority | undefined;
  dueDate?: Date | undefined;
  notes?: string | undefined;
  creationData?: SubOrderCreationDataEntity | undefined;
}

export const SUB_ORDER_STATUS_VALUES = SUB_ORDER_STATUSES;
export const SUB_ORDER_PRIORITY_VALUES = PRIORITIES;
