import { buildPaginationMeta, type PaginatedResult, type PaginationQuery } from '../../../shared/application/contracts/pagination';
import { type OrderDetailDto, type OrderDto, type SubOrderCreationDataDto, type SubOrderDto } from '../../../shared/application/contracts/dental-api-contract';
import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';
import { DOMAIN_ERROR_CODES, DomainError } from '../../../shared/domain/errors/domain-error';
import { type Order, type OrderListQuery, type OrderUpdatePayload, type OrderWritePayload } from '../domain/order';
import { type NameReferences, type OrderRepository } from '../domain/orders-repository';
import { type SubOrder, type SubOrderUpdatePayload, type SubOrderWritePayload } from '../domain/sub-order';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { assertOrderStatusTransition } from './order-workflow';

export class OrdersService {
  public constructor(private readonly orderRepository: OrderRepository) {}

  public async createOrder(payload: OrderWritePayload): Promise<OrderDto> {
    await this.ensureOrderRelations(payload.patientId, payload.doctorId, payload.clinicId);
    await this.ensureUniqueOrderNumber(payload.orderNumber);
    const created = await this.orderRepository.createOrder(payload);
    return this.toOrderDto(created);
  }

  public async getOrderById(orderId: string, scope?: DataVisibilityScope): Promise<OrderDetailDto> {
    const order = await this.orderRepository.findOrderById(orderId, scope);
    if (order === null) {
      throw new DomainError(`Order ${orderId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    const [orderDto, subOrders] = await Promise.all([
      this.toOrderDto(order),
      this.listSubOrders(orderId, scope),
    ]);

    return {
      ...orderDto,
      subOrders,
    };
  }

  public async listOrders(
    query: Omit<OrderListQuery, 'page' | 'pageSize'>,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<OrderDto>> {
    const result = await this.orderRepository.listOrders({
      ...query,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    const references = await this.orderRepository.getNameReferences(result.items);
    const items = result.items.map((order) => this.toOrderDtoFromReferences(order, references));

    return {
      items,
      meta: buildPaginationMeta(result.totalItems, pagination),
    };
  }

  public async updateOrder(
    orderId: string,
    payload: OrderUpdatePayload,
    scope?: DataVisibilityScope,
  ): Promise<OrderDto> {
    if (payload.orderNumber !== undefined) {
      await this.ensureUniqueOrderNumber(payload.orderNumber, orderId);
    }

    const existing = await this.orderRepository.findOrderById(orderId, scope);
    if (existing === null) {
      throw new DomainError(`Order ${orderId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    this.assertOrderWritable(existing, payload);

    if (payload.status !== undefined) {
      assertOrderStatusTransition(existing.status, payload.status);
    }

    if (payload.patientId !== undefined || payload.doctorId !== undefined || payload.clinicId !== undefined) {
      await this.ensureOrderRelations(
        payload.patientId ?? existing.patientId,
        payload.doctorId ?? existing.doctorId,
        payload.clinicId ?? existing.clinicId,
      );
    }

    const updated = await this.orderRepository.updateOrder(orderId, payload, scope);
    if (updated === null) {
      throw new DomainError(`Order ${orderId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    return this.toOrderDto(updated);
  }

  public async deleteOrder(orderId: string, scope?: DataVisibilityScope): Promise<void> {
    const existing = await this.orderRepository.findOrderById(orderId, scope);
    if (existing === null) {
      throw new DomainError(`Order ${orderId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }
    this.assertOrderWritable(existing);

    const deleted = await this.orderRepository.deleteOrder(orderId, scope);
    if (!deleted) {
      throw new DomainError(`Order ${orderId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }

    await this.orderRepository.deleteSubOrdersByOrder(orderId);
  }

  public async listSubOrders(orderId: string, scope?: DataVisibilityScope): Promise<SubOrderDto[]> {
    await this.ensureOrderExists(orderId, scope);
    const subOrders = await this.orderRepository.listSubOrders(orderId, scope);
    return subOrders.map((subOrder) => this.toSubOrderDto(subOrder));
  }

  public async createSubOrders(
    orderId: string,
    payloads: SubOrderWritePayload[],
    scope?: DataVisibilityScope,
  ): Promise<SubOrderDto[]> {
    await this.ensureOrderWritable(orderId, scope);
    payloads.forEach((payload) => this.assertSubOrderProgress(payload));
    const created = await this.orderRepository.createSubOrders(orderId, payloads, scope);
    return created.map((subOrder) => this.toSubOrderDto(subOrder));
  }

  public async replaceSubOrders(
    orderId: string,
    payloads: SubOrderWritePayload[],
    scope?: DataVisibilityScope,
  ): Promise<SubOrderDto[]> {
    await this.ensureOrderWritable(orderId, scope);
    payloads.forEach((payload) => this.assertSubOrderProgress(payload));
    const replaced = await this.orderRepository.replaceSubOrders(orderId, payloads, scope);
    return replaced.map((subOrder) => this.toSubOrderDto(subOrder));
  }

  public async updateSubOrder(
    orderId: string,
    subOrderId: string,
    payload: SubOrderUpdatePayload,
    scope?: DataVisibilityScope,
  ): Promise<SubOrderDto> {
    await this.ensureOrderWritable(orderId, scope);
    this.assertSubOrderProgress(payload);
    const updated = await this.orderRepository.updateSubOrder(orderId, subOrderId, payload, scope);
    if (updated === null) {
      throw new DomainError(
        `Sub-order ${subOrderId} was not found under order ${orderId}`,
        DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND,
      );
    }

    return this.toSubOrderDto(updated);
  }

  public async getSubOrder(
    orderId: string,
    subOrderId: string,
    scope?: DataVisibilityScope,
  ): Promise<SubOrderDto> {
    await this.ensureOrderExists(orderId, scope);
    const subOrder = await this.orderRepository.findSubOrderById(orderId, subOrderId, scope);
    if (subOrder === null) {
      throw new DomainError(
        `Sub-order ${subOrderId} was not found under order ${orderId}`,
        DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND,
      );
    }

    return this.toSubOrderDto(subOrder);
  }

  public async deleteSubOrder(
    orderId: string,
    subOrderId: string,
    scope?: DataVisibilityScope,
  ): Promise<void> {
    await this.ensureOrderWritable(orderId, scope);
    const deleted = await this.orderRepository.deleteSubOrder(orderId, subOrderId, scope);
    if (!deleted) {
      throw new DomainError(
        `Sub-order ${subOrderId} was not found under order ${orderId}`,
        DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND,
      );
    }
  }

  private async ensureOrderExists(orderId: string, scope?: DataVisibilityScope): Promise<void> {
    const order = await this.orderRepository.findOrderById(orderId, scope);
    if (order === null) {
      throw new DomainError(`Order ${orderId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }
  }

  private async ensureOrderWritable(orderId: string, scope?: DataVisibilityScope): Promise<void> {
    const order = await this.orderRepository.findOrderById(orderId, scope);
    if (order === null) {
      throw new DomainError(`Order ${orderId} was not found`, DOMAIN_ERROR_CODES.ENTITY_NOT_FOUND);
    }
    this.assertOrderWritable(order);
  }

  private assertOrderWritable(
    order: Order,
    payload?: OrderUpdatePayload,
  ): void {
    if (!order.isLocked) return;

    const payloadKeys = payload
      ? Object.keys(payload).filter((key) => payload[key as keyof OrderUpdatePayload] !== undefined)
      : [];
    const isUnlockOnly =
      payloadKeys.length === 1 &&
      payload?.isLocked === false;
    if (isUnlockOnly) return;

    throw new DomainError(
      'Locked orders cannot be modified. Unlock the order first.',
      DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
    );
  }

  private async ensureUniqueOrderNumber(orderNumber: string, excludeOrderId?: string): Promise<void> {
    const exists = await this.orderRepository.isOrderNumberTaken(orderNumber, excludeOrderId);
    if (exists) {
      throw new DomainError(
        `Order number '${orderNumber}' already exists`,
        DOMAIN_ERROR_CODES.ENTITY_CONFLICT,
        { field: 'orderNumber' },
      );
    }
  }

  private async ensureOrderRelations(
    patientId: string,
    doctorId: string,
    clinicId: string,
  ): Promise<void> {
    const [patient, doctor, clinicExists] = await Promise.all([
      this.orderRepository.findPatientById(patientId),
      this.orderRepository.findDoctorById(doctorId),
      this.orderRepository.clinicExists(clinicId),
    ]);

    if (!clinicExists) {
      throw new DomainError(`Clinic ${clinicId} does not exist`, DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION, {
        field: 'clinicId',
      });
    }

    if (doctor === null) {
      throw new DomainError(`Doctor ${doctorId} does not exist`, DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION, {
        field: 'doctorId',
      });
    }

    if (doctor.clinicId !== clinicId) {
      throw new DomainError(
        'Doctor must belong to the selected clinic',
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        { clinicId, doctorId },
      );
    }

    if (patient === null) {
      throw new DomainError(
        `Patient ${patientId} does not exist`,
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        { field: 'patientId' },
      );
    }

    if (patient.clinicId !== clinicId) {
      throw new DomainError(
        'Patient must belong to the selected clinic',
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        { clinicId, patientId },
      );
    }

    if (patient.doctorId !== doctorId) {
      throw new DomainError(
        'Patient must belong to the selected doctor',
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        { doctorId, patientId },
      );
    }
  }

  private assertSubOrderProgress(payload: {
    formsComplete?: number | undefined;
    formsTotal?: number | undefined;
    scansComplete?: number | undefined;
    scansTotal?: number | undefined;
  }): void {
    if (
      payload.formsComplete !== undefined &&
      payload.formsTotal !== undefined &&
      payload.formsComplete > payload.formsTotal
    ) {
      throw new DomainError(
        'formsComplete cannot exceed formsTotal',
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
      );
    }

    if (
      payload.scansComplete !== undefined &&
      payload.scansTotal !== undefined &&
      payload.scansComplete > payload.scansTotal
    ) {
      throw new DomainError(
        'scansComplete cannot exceed scansTotal',
        DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
      );
    }
  }

  private async toOrderDto(order: Order): Promise<OrderDto> {
    const references = await this.orderRepository.getNameReferences([order]);
    return this.toOrderDtoFromReferences(order, references);
  }

  private toOrderDtoFromReferences(order: Order, references: NameReferences): OrderDto {
    const patientName = references.patientById.get(order.patientId);
    const doctorName = references.doctorById.get(order.doctorId);
    const clinicName = references.clinicById.get(order.clinicId);

    const technicianName =
      order.technicianId === undefined ? undefined : references.technicianById.get(order.technicianId);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      patientId: order.patientId,
      patientName: patientName ?? '',
      doctorId: order.doctorId,
      doctorName: doctorName ?? '',
      clinicId: order.clinicId,
      clinicName: clinicName ?? '',
      scanCenterId: order.scanCenterId ?? '',
      scanCenterName:
        order.scanCenterId === undefined
          ? ''
          : (this.orderRepository.findScanCenterNameById(order.scanCenterId) ?? ''),
      status: order.status,
      priority: order.priority,
      restoration: order.restoration,
      arch: order.arch,
      format: order.format,
      shade: order.shade,
      units: order.units,
      amount: order.amount,
      billed: order.billed,
      ...(order.billedAmount !== undefined ? { billedAmount: order.billedAmount } : {}),
      billTo: order.billTo,
      vouchers: order.vouchers,
      isLocked: order.isLocked,
      hasNotes: order.hasNotes,
      notes: order.notes,
      ...(order.archiveDate !== undefined ? { archiveDate: order.archiveDate.toISOString() } : {}),
      receivedAt: order.receivedAt.toISOString(),
      ...(order.sentAt !== undefined ? { sentAt: order.sentAt.toISOString() } : {}),
      updatedAt: order.updatedAt.toISOString(),
      ...(order.chargedAt !== undefined ? { chargedAt: order.chargedAt.toISOString() } : {}),
      dueDate: order.dueDate.toISOString(),
      ...(order.changeRequestId !== undefined ? { changeRequest: order.changeRequestId } : {}),
      ...(order.csTask !== undefined ? { csTask: order.csTask } : {}),
      ...(order.technicianId !== undefined ? { technicianId: order.technicianId } : {}),
      ...(technicianName !== undefined ? { technicianName } : {}),
      ...(order.creationData !== undefined
        ? {
            creationData: {
              services: order.creationData.services.map((service) => this.toSubOrderCreationDataDto(service)),
              ...(order.creationData.communication !== undefined
                ? { communication: this.toCommunicationDto(order.creationData.communication) }
                : {}),
            },
          }
        : {}),
    };
  }

  private toSubOrderDto(subOrder: SubOrder): SubOrderDto {
    return {
      id: subOrder.id,
      orderId: subOrder.orderId,
      service: subOrder.service,
      icon: subOrder.icon,
      status: subOrder.status,
      formsComplete: subOrder.formsComplete,
      formsTotal: subOrder.formsTotal,
      scansComplete: subOrder.scansComplete,
      scansTotal: subOrder.scansTotal,
      teeth: subOrder.teeth,
      priority: subOrder.priority,
      dueDate: subOrder.dueDate.toISOString(),
      notes: subOrder.notes,
      ...(subOrder.creationData !== undefined
        ? { creationData: this.toSubOrderCreationDataDto(subOrder.creationData) }
        : {}),
    };
  }

  private toSubOrderCreationDataDto(input: {
    serviceId: string;
    serviceDetails: Record<string, string>;
    serviceForm: Record<string, string>;
    selectedTeeth: number[];
    scanRequirements: string[];
    fileReferences: string[];
  }): SubOrderCreationDataDto {
    return {
      serviceId: input.serviceId,
      serviceDetails: input.serviceDetails,
      serviceForm: input.serviceForm,
      selectedTeeth: input.selectedTeeth,
      scanRequirements: input.scanRequirements,
      fileReferences: input.fileReferences,
    };
  }

  private toCommunicationDto(input: {
    internalCaseNote: string;
    internalCaseFiles: string[];
    sendMailTo: string[];
    sendIhTaskTo?: string | undefined;
    rushTask: boolean;
  }): {
    internalCaseNote: string;
    internalCaseFiles: string[];
    sendMailTo: string[];
    sendIhTaskTo?: string;
    rushTask: boolean;
  } {
    return {
      internalCaseNote: input.internalCaseNote,
      internalCaseFiles: input.internalCaseFiles,
      sendMailTo: input.sendMailTo,
      ...(input.sendIhTaskTo !== undefined ? { sendIhTaskTo: input.sendIhTaskTo } : {}),
      rushTask: input.rushTask,
    };
  }
}

export function ensureNonEmptyOrderUpdate<TPayload extends Record<string, unknown>>(payload: TPayload): void {
  if (Object.keys(payload).length === 0) {
    throw new ApplicationError({
      message: 'At least one field must be provided for update',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }
}

export function ensureNonEmptySubOrderUpdate<TPayload extends Record<string, unknown>>(payload: TPayload): void {
  if (Object.keys(payload).length === 0) {
    throw new ApplicationError({
      message: 'At least one sub-order field must be provided for update',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }
}
