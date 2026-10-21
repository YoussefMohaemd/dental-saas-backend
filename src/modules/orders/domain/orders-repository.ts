import { type Order, type OrderListQuery, type OrderUpdatePayload, type OrderWritePayload } from './order';
import { type SubOrder, type SubOrderUpdatePayload, type SubOrderWritePayload } from './sub-order';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export interface OrderListResult {
  items: Order[];
  totalItems: number;
}

export interface PatientReference {
  id: string;
  name: string;
  doctorId: string;
  clinicId: string;
}

export interface DoctorReference {
  id: string;
  name: string;
  clinicId: string;
}

export interface NameReferences {
  patientById: Map<string, string>;
  doctorById: Map<string, string>;
  clinicById: Map<string, string>;
  technicianById: Map<string, string>;
}

export interface OrderRepository {
  createOrder(payload: OrderWritePayload): Promise<Order>;
  findOrderById(orderId: string, scope?: DataVisibilityScope): Promise<Order | null>;
  listOrders(query: OrderListQuery): Promise<OrderListResult>;
  updateOrder(orderId: string, payload: OrderUpdatePayload, scope?: DataVisibilityScope): Promise<Order | null>;
  deleteOrder(orderId: string, scope?: DataVisibilityScope): Promise<boolean>;
  isOrderNumberTaken(orderNumber: string, excludeOrderId?: string): Promise<boolean>;
  findPatientById(patientId: string): Promise<PatientReference | null>;
  findDoctorById(doctorId: string): Promise<DoctorReference | null>;
  clinicExists(clinicId: string): Promise<boolean>;
  getNameReferences(orders: Order[]): Promise<NameReferences>;
  findScanCenterNameById(scanCenterId: string): string | null;
  listSubOrders(orderId: string, scope?: DataVisibilityScope): Promise<SubOrder[]>;
  findSubOrderById(orderId: string, subOrderId: string, scope?: DataVisibilityScope): Promise<SubOrder | null>;
  createSubOrders(orderId: string, payloads: SubOrderWritePayload[], scope?: DataVisibilityScope): Promise<SubOrder[]>;
  replaceSubOrders(orderId: string, payloads: SubOrderWritePayload[], scope?: DataVisibilityScope): Promise<SubOrder[]>;
  updateSubOrder(orderId: string, subOrderId: string, payload: SubOrderUpdatePayload, scope?: DataVisibilityScope): Promise<SubOrder | null>;
  deleteSubOrder(orderId: string, subOrderId: string, scope?: DataVisibilityScope): Promise<boolean>;
  deleteSubOrdersByOrder(orderId: string): Promise<void>;
}
