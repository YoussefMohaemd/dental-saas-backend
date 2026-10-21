import {
  ARCH_TYPES,
  ORDER_STATUSES,
  PRIORITIES,
  RESTORATIVE_TYPES,
  type ArchType,
  type OrderStatus,
  type Priority,
  type RestorativeType,
  type SubOrderCreationDataEntity,
} from '../../../shared/domain/entities/dental-data-model';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export interface OrderCreationData {
  services: SubOrderCreationDataEntity[];
  communication?: {
    internalCaseNote: string;
    internalCaseFiles: string[];
    sendMailTo: string[];
    sendIhTaskTo?: string | undefined;
    rushTask: boolean;
  } | undefined;
}

export interface Order {
  id: string;
  orderNumber: string;
  patientId: string;
  doctorId: string;
  clinicId: string;
  scanCenterId?: string | undefined;
  status: OrderStatus;
  priority: Priority;
  restoration: RestorativeType;
  arch: ArchType;
  format: string;
  shade: string;
  units: number;
  amount: number;
  billed: boolean;
  billedAmount?: number | undefined;
  billTo: string;
  vouchers: number;
  isLocked: boolean;
  hasNotes: boolean;
  notes: string;
  archiveDate?: Date | undefined;
  receivedAt: Date;
  sentAt?: Date | undefined;
  updatedAt: Date;
  chargedAt?: Date | undefined;
  dueDate: Date;
  changeRequestId?: string | undefined;
  csTask?: string | undefined;
  technicianId?: string | undefined;
  creationData?: OrderCreationData | undefined;
  createdAt: Date;
}

export interface OrderListQuery {
  scope?: DataVisibilityScope;
  search?: string | undefined;
  page: number;
  pageSize: number;
  sortBy:
    | 'orderNumber'
    | 'status'
    | 'priority'
    | 'restoration'
    | 'receivedAt'
    | 'dueDate'
    | 'amount'
    | 'createdAt'
    | 'updatedAt';
  sortDirection: 'asc' | 'desc';
  statuses: OrderStatus[];
  duration?: 'today' | 'week' | 'month' | '2-months' | '3-months' | '6-months' | undefined;
  serviceIds: string[];
}

export interface OrderWritePayload {
  orderNumber: string;
  patientId: string;
  doctorId: string;
  clinicId: string;
  scanCenterId?: string | undefined;
  status: OrderStatus;
  priority: Priority;
  restoration: RestorativeType;
  arch: ArchType;
  format: string;
  shade: string;
  units: number;
  amount: number;
  billed: boolean;
  billedAmount?: number | undefined;
  billTo: string;
  vouchers: number;
  isLocked: boolean;
  hasNotes: boolean;
  notes: string;
  archiveDate?: Date | undefined;
  receivedAt: Date;
  sentAt?: Date | undefined;
  chargedAt?: Date | undefined;
  dueDate: Date;
  changeRequestId?: string | undefined;
  csTask?: string | undefined;
  technicianId?: string | undefined;
  creationData?: OrderCreationData | undefined;
}

export interface OrderUpdatePayload {
  orderNumber?: string | undefined;
  patientId?: string | undefined;
  doctorId?: string | undefined;
  clinicId?: string | undefined;
  scanCenterId?: string | undefined;
  status?: OrderStatus | undefined;
  priority?: Priority | undefined;
  restoration?: RestorativeType | undefined;
  arch?: ArchType | undefined;
  format?: string | undefined;
  shade?: string | undefined;
  units?: number | undefined;
  amount?: number | undefined;
  billed?: boolean | undefined;
  billedAmount?: number | undefined;
  billTo?: string | undefined;
  vouchers?: number | undefined;
  isLocked?: boolean | undefined;
  hasNotes?: boolean | undefined;
  notes?: string | undefined;
  archiveDate?: Date | undefined;
  receivedAt?: Date | undefined;
  sentAt?: Date | undefined;
  chargedAt?: Date | undefined;
  dueDate?: Date | undefined;
  changeRequestId?: string | undefined;
  csTask?: string | undefined;
  technicianId?: string | undefined;
  creationData?: OrderCreationData | undefined;
}

export const ORDER_LIST_SORT_FIELDS: readonly OrderListQuery['sortBy'][] = [
  'orderNumber',
  'status',
  'priority',
  'restoration',
  'receivedAt',
  'dueDate',
  'amount',
  'createdAt',
  'updatedAt',
];

export const ORDER_DURATION_VALUES: ReadonlyArray<
  NonNullable<OrderListQuery['duration']>
> = ['today', 'week', 'month', '2-months', '3-months', '6-months'];

export const ORDER_STATUS_VALUES = ORDER_STATUSES;
export const ORDER_PRIORITY_VALUES = PRIORITIES;
export const ORDER_ARCH_VALUES = ARCH_TYPES;
export const ORDER_RESTORATION_VALUES = RESTORATIVE_TYPES;
