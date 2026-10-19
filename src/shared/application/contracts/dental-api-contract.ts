import { type PaginationQuery } from './pagination';
import { type SortDirection } from './query';

export type OrderStatus =
  | 'New'
  | 'Review'
  | 'Design'
  | 'Production'
  | 'Quality Check'
  | 'Ready'
  | 'Completed'
  | 'Cancelled';

export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent';
export type ArchType = 'Maxilla' | 'Mandible' | 'Both';
export type RestorativeType =
  | 'Crown'
  | 'Bridge'
  | 'Veneer'
  | 'Implant Crown'
  | 'Full Arch'
  | 'Night Guard'
  | 'Inlay'
  | 'Onlay'
  | 'Partial Denture'
  | 'Complete Denture';

export type SubOrderStatus = 'done' | 'in-progress' | 'pending' | 'blocked';
export type CaseStatus = 'Open' | 'In Progress' | 'Review' | 'Closed';
export type EntityActivityStatus = 'Active' | 'Inactive';
export type ChangeRequestStatus =
  | 'Pending'
  | 'In Review'
  | 'Approved'
  | 'Rejected'
  | 'Completed';
export type BillingStatus = 'Pending' | 'Invoiced' | 'Paid' | 'Overdue' | 'Cancelled';
export type ScanCenterStatus = 'Operational' | 'Maintenance';
export type NotificationType = 'order' | 'workflow' | 'file' | 'billing' | 'system' | 'request';
export type ReportEmployeeStatus = 'Active' | 'On Leave';
export type UserStatus = 'active' | 'invited' | 'disabled';

export interface OrderDto {
  id: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  clinicId: string;
  clinicName: string;
  scanCenterId: string;
  scanCenterName: string;
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
  archiveDate?: string;
  receivedAt: string;
  sentAt?: string;
  updatedAt: string;
  chargedAt?: string;
  dueDate: string;
  changeRequest?: string;
  csTask?: string;
  technicianId?: string;
  technicianName?: string;
  creationData?: {
    services: SubOrderCreationDataDto[];
    communication?: {
      internalCaseNote: string;
      internalCaseFiles: string[];
      sendMailTo: string[];
      sendIhTaskTo?: string;
      rushTask: boolean;
    };
  };
}

export interface OrderDetailDto extends OrderDto {
  subOrders: SubOrderDto[];
}

export interface SubOrderCreationDataDto {
  serviceId: string;
  serviceDetails: Record<string, string>;
  serviceForm: Record<string, string>;
  selectedTeeth: number[];
  scanRequirements: string[];
  fileReferences: string[];
}

export interface SubOrderDto {
  id: string;
  orderId?: string;
  service: string;
  icon: string;
  status: SubOrderStatus;
  formsComplete: number;
  formsTotal: number;
  scansComplete: number;
  scansTotal: number;
  teeth: number[];
  priority: Priority;
  dueDate: string;
  notes: string;
  creationData?: SubOrderCreationDataDto;
}

export interface SubOrderDetailDto {
  id: string;
  forms: Array<{
    id: string;
    label: string;
    required: boolean;
    status: 'complete' | 'incomplete' | 'optional';
  }>;
  scans: Array<{
    id: string;
    label: string;
    format: string;
    status: 'uploaded' | 'missing' | 'optional' | 'selected-local';
    updatedAt?: string;
  }>;
  activity: Array<{
    time: string;
    user: string;
    text: string;
  }>;
}

export interface PatientDto {
  id: string;
  name: string;
  dob: string;
  gender: 'M' | 'F';
  phone: string;
  email: string;
  clinicId: string;
  clinicName: string;
  doctorId: string;
  doctorName: string;
  status: EntityActivityStatus;
  ordersCount: number;
  lastVisit: string;
}

export interface DoctorDto {
  id: string;
  lookupId?: string;
  name: string;
  specialty: string;
  clinicId: string;
  clinicName: string;
  email: string;
  phone: string;
  status: EntityActivityStatus;
  ordersCount: number;
  joinedDate: string;
  avatar: string;
}

export interface ClinicDto {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  doctorsCount: number;
  patientsCount: number;
  ordersCount: number;
  status: EntityActivityStatus;
  accountManager: string;
}

export interface CaseDto {
  id: string;
  caseNumber: string;
  title: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  clinicId: string;
  clinicName: string;
  status: CaseStatus;
  priority: Priority;
  ordersCount: number;
  filesCount: number;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

export interface ChangeRequestDto {
  id: string;
  requestNumber: string;
  orderId: string;
  orderNumber: string;
  patientName: string;
  requester: string;
  status: ChangeRequestStatus;
  priority: Priority;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingRecordDto {
  id: string;
  orderId: string;
  orderNumber: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  amount: number;
  status: BillingStatus;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate: string;
  paidDate?: string;
  vouchers: number;
  notes: string;
}

export interface DocumentDto {
  id: string;
  name: string;
  category: 'Prescriptions' | 'Scan Files' | 'Patient Photos' | 'Invoices' | 'Reports';
  type: string;
  size: string;
  date: string;
  doctor: string;
  patientName?: string;
  orderId?: string;
  orderNumber?: string;
  subOrderId?: string;
}

export interface ScanCenterDto {
  id: string;
  name: string;
  location: string;
  operator: string;
  devices: number;
  activeOrders: number;
  completedToday: number;
  status: ScanCenterStatus;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  relatedId?: string;
  relatedType?: string;
}

export interface OrderArchiveRecordDto {
  id: string;
  orderId: string;
  scanCenter: string;
  doctorName: string;
  patientName: string;
  serviceName: string;
  maxillary: boolean;
  mandibular: boolean;
  amount: number;
  vouchers: number;
  receivedAt: string;
  sentAt: string;
  operator: string;
  archiveDate: string;
  chargedAt: string | null;
}

export interface TeamPerformanceRecordDto {
  userId: number;
  type: string;
  fullName: string;
  completedOrders: number;
  revenueCollected: number;
  avgTurnaroundDays: number;
  onTimeRate: number;
  status: ReportEmployeeStatus;
}

export interface UserDto {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  clinicId?: string;
  avatarUrl?: string;
  status: UserStatus;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListQueryParams extends Partial<PaginationQuery> {
  search?: string;
  sortBy?: string;
  sortDirection?: SortDirection;
}

export interface OrdersListQuery extends ListQueryParams {
  status?: OrderStatus[];
  duration?: 'today' | 'week' | 'month' | '2-months' | '3-months' | '6-months';
  service?: string[];
  includeSubOrders?: boolean;
}

export interface SubOrdersListQuery extends ListQueryParams {
  orderId?: string;
  status?: SubOrderStatus[];
  priority?: Priority[];
}

export interface PatientsListQuery extends ListQueryParams {
  status?: EntityActivityStatus[];
}

export interface DoctorsListQuery extends ListQueryParams {
  status?: EntityActivityStatus[];
  clinicId?: string;
}

export interface ClinicsListQuery extends ListQueryParams {
  status?: EntityActivityStatus[];
}

export interface CasesListQuery extends ListQueryParams {
  status?: CaseStatus[];
}

export interface ChangeRequestsListQuery extends ListQueryParams {
  status?: ChangeRequestStatus[];
  priority?: Priority[];
}

export interface BillingListQuery extends ListQueryParams {
  status?: BillingStatus[];
  dateFrom?: string;
  dateTo?: string;
}

export interface DocumentsListQuery extends ListQueryParams {
  category?: Array<'Prescriptions' | 'Scan Files' | 'Patient Photos' | 'Invoices' | 'Reports'>;
}

export interface NotificationsListQuery extends ListQueryParams {
  type?: NotificationType[];
  read?: boolean;
}

export interface OrdersRangeReportQuery extends ListQueryParams {
  from?: string;
  to?: string;
}

export interface QuarterlyReportQuery {
  year: number;
  quarter?: 1 | 2 | 3 | 4;
}

export interface OrderWorkflowTransitionRequest {
  toStatus: OrderStatus;
  mode?: 'strict' | 'override';
  reason?: string;
}

export interface ChangeRequestDecisionRequest {
  status: Extract<ChangeRequestStatus, 'Approved' | 'Rejected' | 'In Review' | 'Completed'>;
  note?: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthLoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  principal: {
    userId: string;
    tenantId: string;
    roles: string[];
  };
}
