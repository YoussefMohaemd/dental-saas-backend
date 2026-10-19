import { type Request, type Response } from 'express';
import { Types } from 'mongoose';

import { normalizePaginationQuery } from '../../../shared/application/contracts/pagination';
import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';
import { sendCreated, sendNoContent, sendOk } from '../../../shared/presentation/http/api-response';
import { type RequestWithContext } from '../../../shared/presentation/http/request-context';
import {
  ensureNonEmptyOrderUpdate,
  ensureNonEmptySubOrderUpdate,
  type OrdersService,
} from '../application/orders-service';
import {
  createOrderBodySchema,
  createSubOrdersBodySchema,
  orderAndSubOrderParamsSchema,
  orderIdParamsSchema,
  ordersListQuerySchema,
  updateOrderBodySchema,
  updateSubOrderBodySchema,
} from './orders.schemas';

export class OrdersController {
  public constructor(private readonly ordersService: OrdersService) {}

  public createOrder = async (req: Request, res: Response): Promise<void> => {
    const payload = removeUndefined(createOrderBodySchema.parse(req.body));
    this.assertOrderLinkIds(payload);

    const created = await this.ordersService.createOrder(payload);
    sendCreated(res, created, this.buildMeta(req as RequestWithContext));
  };

  public getOrderById = async (req: Request, res: Response): Promise<void> => {
    const { orderId } = orderIdParamsSchema.parse(req.params);
    assertValidObjectId(orderId, 'orderId');

    const order = await this.ordersService.getOrderById(orderId);
    sendOk(res, order, this.buildMeta(req as RequestWithContext));
  };

  public listOrders = async (req: Request, res: Response): Promise<void> => {
    const query = ordersListQuerySchema.parse(req.query);
    const pagination = normalizePaginationQuery({
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.pageSize !== undefined ? { pageSize: query.pageSize } : {}),
    });

    const result = await this.ordersService.listOrders(
      {
        ...(query.search !== undefined ? { search: query.search } : {}),
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        statuses: query.status,
        duration: query.duration,
        serviceIds: query.service,
      },
      pagination,
    );

    sendOk(res, result.items, {
      ...this.buildMeta(req as RequestWithContext),
      pagination: result.meta,
    });
  };

  public updateOrder = async (req: Request, res: Response): Promise<void> => {
    const { orderId } = orderIdParamsSchema.parse(req.params);
    assertValidObjectId(orderId, 'orderId');

    const payload = removeUndefined(updateOrderBodySchema.parse(req.body));
    ensureNonEmptyOrderUpdate(payload);
    this.assertOrderLinkIds(payload);

    const updated = await this.ordersService.updateOrder(orderId, payload);
    sendOk(res, updated, this.buildMeta(req as RequestWithContext));
  };

  public deleteOrder = async (req: Request, res: Response): Promise<void> => {
    const { orderId } = orderIdParamsSchema.parse(req.params);
    assertValidObjectId(orderId, 'orderId');
    await this.ordersService.deleteOrder(orderId);
    sendNoContent(res);
  };

  public listSubOrders = async (req: Request, res: Response): Promise<void> => {
    const { orderId } = orderIdParamsSchema.parse(req.params);
    assertValidObjectId(orderId, 'orderId');

    const subOrders = await this.ordersService.listSubOrders(orderId);
    sendOk(res, subOrders, this.buildMeta(req as RequestWithContext));
  };

  public createSubOrders = async (req: Request, res: Response): Promise<void> => {
    const { orderId } = orderIdParamsSchema.parse(req.params);
    assertValidObjectId(orderId, 'orderId');

    const payload = createSubOrdersBodySchema.parse(req.body);
    const created = await this.ordersService.createSubOrders(orderId, payload);
    sendCreated(res, created, this.buildMeta(req as RequestWithContext));
  };

  public replaceSubOrders = async (req: Request, res: Response): Promise<void> => {
    const { orderId } = orderIdParamsSchema.parse(req.params);
    assertValidObjectId(orderId, 'orderId');

    const payload = createSubOrdersBodySchema.parse(req.body);
    const replaced = await this.ordersService.replaceSubOrders(orderId, payload);
    sendOk(res, replaced, this.buildMeta(req as RequestWithContext));
  };

  public getSubOrder = async (req: Request, res: Response): Promise<void> => {
    const { orderId, subOrderId } = orderAndSubOrderParamsSchema.parse(req.params);
    assertValidObjectId(orderId, 'orderId');
    assertValidObjectId(subOrderId, 'subOrderId');

    const subOrder = await this.ordersService.getSubOrder(orderId, subOrderId);
    sendOk(res, subOrder, this.buildMeta(req as RequestWithContext));
  };

  public updateSubOrder = async (req: Request, res: Response): Promise<void> => {
    const { orderId, subOrderId } = orderAndSubOrderParamsSchema.parse(req.params);
    assertValidObjectId(orderId, 'orderId');
    assertValidObjectId(subOrderId, 'subOrderId');

    const payload = removeUndefined(updateSubOrderBodySchema.parse(req.body));
    ensureNonEmptySubOrderUpdate(payload);

    const updated = await this.ordersService.updateSubOrder(orderId, subOrderId, payload);
    sendOk(res, updated, this.buildMeta(req as RequestWithContext));
  };

  public deleteSubOrder = async (req: Request, res: Response): Promise<void> => {
    const { orderId, subOrderId } = orderAndSubOrderParamsSchema.parse(req.params);
    assertValidObjectId(orderId, 'orderId');
    assertValidObjectId(subOrderId, 'subOrderId');

    await this.ordersService.deleteSubOrder(orderId, subOrderId);
    sendNoContent(res);
  };

  private assertOrderLinkIds(payload: Record<string, unknown>): void {
    const fields = [
      'patientId',
      'doctorId',
      'clinicId',
      'scanCenterId',
      'changeRequestId',
      'technicianId',
    ] as const;
    for (const field of fields) {
      const value = payload[field];
      if (typeof value === 'string') {
        assertValidObjectId(value, field);
      }
    }
  }

  private buildMeta(req: RequestWithContext): { requestId?: string } | undefined {
    return req.context.requestId === undefined ? undefined : { requestId: req.context.requestId };
  }
}

function removeUndefined<TPayload extends Record<string, unknown>>(payload: TPayload): TPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as TPayload;
}

function assertValidObjectId(value: string, field: string): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new ApplicationError({
      message: `${field} must be a valid identifier`,
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: { field },
    });
  }
}
