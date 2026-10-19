export const ENTITY_ACTIVITY_STATUSES = ['Active', 'Inactive'] as const;
export type EntityActivityStatus = (typeof ENTITY_ACTIVITY_STATUSES)[number];

export const ORDER_STATUSES = [
  'New',
  'Review',
  'Design',
  'Production',
  'Quality Check',
  'Ready',
  'Completed',
  'Cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ARCH_TYPES = ['Maxilla', 'Mandible', 'Both'] as const;
export type ArchType = (typeof ARCH_TYPES)[number];

export const RESTORATIVE_TYPES = [
  'Crown',
  'Bridge',
  'Veneer',
  'Implant Crown',
  'Full Arch',
  'Night Guard',
  'Inlay',
  'Onlay',
  'Partial Denture',
  'Complete Denture',
] as const;
export type RestorativeType = (typeof RESTORATIVE_TYPES)[number];

export const SUB_ORDER_STATUSES = ['done', 'in-progress', 'pending', 'blocked'] as const;
export type SubOrderStatus = (typeof SUB_ORDER_STATUSES)[number];

export const CASE_STATUSES = ['Open', 'In Progress', 'Review', 'Closed'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CHANGE_REQUEST_STATUSES = [
  'Pending',
  'In Review',
  'Approved',
  'Rejected',
  'Completed',
] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const BILLING_STATUSES = ['Pending', 'Invoiced', 'Paid', 'Overdue', 'Cancelled'] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const NOTIFICATION_TYPES = ['order', 'workflow', 'file', 'billing', 'system', 'request'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const DOCUMENT_CATEGORIES = [
  'Prescriptions',
  'Scan Files',
  'Patient Photos',
  'Invoices',
  'Reports',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const USER_STATUSES = ['active', 'invited', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export type EntityId = string;

export interface UserEntity {
  tenantId: EntityId;
  fullName: string;
  email: string;
  passwordHash?: string;
  roles: string[];
  clinicId?: EntityId;
  avatarUrl?: string;
  status: UserStatus;
  lastLoginAt?: Date;
  tokenVersion: number;
}

export interface ClinicEntity {
  tenantId: EntityId;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  status: EntityActivityStatus;
  accountManager: string;
}

export interface DoctorEntity {
  tenantId: EntityId;
  lookupId?: string;
  name: string;
  specialty: string;
  clinicId: EntityId;
  email: string;
  phone: string;
  status: EntityActivityStatus;
  joinedDate: Date;
  avatar: string;
}

export interface PatientEntity {
  tenantId: EntityId;
  name: string;
  dob: Date;
  gender: 'M' | 'F';
  phone: string;
  email: string;
  clinicId: EntityId;
  doctorId: EntityId;
  status: EntityActivityStatus;
  lastVisit: Date;
}

export interface SubOrderCreationDataEntity {
  serviceId: string;
  serviceDetails: Record<string, string>;
  serviceForm: Record<string, string>;
  selectedTeeth: number[];
  scanRequirements: string[];
  fileReferences: string[];
}

export interface OrderEntity {
  tenantId: EntityId;
  orderNumber: string;
  patientId: EntityId;
  doctorId: EntityId;
  clinicId: EntityId;
  scanCenterId?: EntityId;
  status: OrderStatus;
  priority: Priority;
  restoration: RestorativeType;
  arch: ArchType;
  format: string;
  shade: string;
  units: number;
  amount: number;
  billed: boolean;
  billedAmount?: number;
  billTo: string;
  vouchers: number;
  isLocked: boolean;
  hasNotes: boolean;
  notes: string;
  archiveDate?: Date;
  receivedAt: Date;
  sentAt?: Date;
  chargedAt?: Date;
  dueDate: Date;
  changeRequestId?: EntityId;
  csTask?: string;
  technicianId?: EntityId;
  creationData?: {
    services: SubOrderCreationDataEntity[];
    communication?: {
      internalCaseNote: string;
      internalCaseFiles: string[];
      sendMailTo: string[];
      sendIhTaskTo?: string;
      rushTask: boolean;
    };
  };
}

export interface SubOrderEntity {
  tenantId: EntityId;
  orderId: EntityId;
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
  creationData?: SubOrderCreationDataEntity;
}

export interface NotificationEntity {
  tenantId: EntityId;
  recipientId: EntityId;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  relatedId?: EntityId;
  relatedType?: string;
}

export interface DocumentEntity {
  tenantId: EntityId;
  name: string;
  category: DocumentCategory;
  type: string;
  sizeBytes: number;
  date: Date;
  doctorId?: EntityId;
  patientId?: EntityId;
  clinicId?: EntityId;
  orderId?: EntityId;
  subOrderId?: EntityId;
  uploadedBy: EntityId;
}

export interface CaseEntity {
  tenantId: EntityId;
  caseNumber: string;
  title: string;
  patientId: EntityId;
  doctorId: EntityId;
  clinicId: EntityId;
  status: CaseStatus;
  priority: Priority;
  ordersCount: number;
  filesCount: number;
  notes: string;
}

export interface BillingRecordEntity {
  tenantId: EntityId;
  orderId: EntityId;
  patientId: EntityId;
  doctorId: EntityId;
  clinicId: EntityId;
  amount: number;
  status: BillingStatus;
  invoiceNumber?: string;
  invoiceDate?: Date;
  dueDate: Date;
  paidDate?: Date;
  vouchers: number;
  notes: string;
}

export interface ChangeRequestEntity {
  tenantId: EntityId;
  requestNumber: string;
  orderId: EntityId;
  requesterId: EntityId;
  assigneeId?: EntityId;
  status: ChangeRequestStatus;
  priority: Priority;
  description: string;
  resolutionNote?: string;
}
