import { z } from 'zod';

import { type PaginationQuery } from '../../../shared/application/contracts/pagination';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { type OrdersService } from '../../orders/application/orders-service';
import { type PatientService } from '../../patients/application/patient-service';
import {
  ORDER_DURATION_VALUES,
  ORDER_LIST_SORT_FIELDS,
  ORDER_STATUS_VALUES,
} from '../../orders/domain/order';
import { type AssistantPlanAction, type AssistantToolDefinition } from '../domain/assistant.types';

export interface AssistantActionExecutionSummary {
  actionId: string;
  tool: string;
  status: 'executed';
  result?: unknown;
}

interface AssistantActionExecutorDependencies {
  ordersService: OrdersService;
  patientService: PatientService;
}

interface AssistantExecutionContext {
  scope: DataVisibilityScope;
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const searchOrdersArgsSchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z.enum(ORDER_LIST_SORT_FIELDS).default('createdAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
    status: z.array(z.enum(ORDER_STATUS_VALUES)).default([]),
    duration: z.enum(ORDER_DURATION_VALUES).optional(),
    service: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

const getOrderDetailsArgsSchema = z
  .object({
    orderId: z.string().trim().min(1),
  })
  .strict();

const searchPatientsArgsSchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z
      .enum(['name', 'dob', 'gender', 'status', 'lastVisit', 'createdAt', 'updatedAt'])
      .default('createdAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
    status: z.array(z.enum(['Active', 'Inactive'])).default([]),
  })
  .strict();

const getPatientDetailsArgsSchema = z
  .object({
    patientId: z.string().trim().min(1),
  })
  .strict();

const createOrderArgsSchema = z
  .object({
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

const updateOrderArgsSchema = z
  .object({
    orderId: z.string().trim().min(1),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export class AssistantActionExecutor {
  public constructor(private readonly dependencies: AssistantActionExecutorDependencies) {}

  public executeReadActions(
    actions: AssistantPlanAction[],
    toolByActionId: Map<string, AssistantToolDefinition>,
    context: AssistantExecutionContext,
  ): Promise<AssistantActionExecutionSummary[]> {
    return Promise.all(
      actions
        .filter((action) => {
          const tool = toolByActionId.get(action.id);
          return tool?.operationType === 'read';
        })
        .map((action) => this.executeReadAction(action, context)),
    );
  }

  public executeConfirmedWriteAction(input: {
    actionId: string;
    toolName: string;
    payload: Record<string, unknown>;
    context: AssistantExecutionContext;
  }): Promise<AssistantActionExecutionSummary> {
    if (containsDeleteOperation(input.toolName)) {
      throw new ApplicationError({
        message: 'Delete operations are blocked',
        statusCode: 403,
        code: APPLICATION_ERROR_CODES.FORBIDDEN,
        expose: true,
        details: { tool: input.toolName },
      });
    }

    if (input.toolName === 'create_order') {
      return this.executeCreateOrder(input);
    }

    if (input.toolName === 'update_order') {
      return this.executeUpdateOrder(input);
    }

    throw new ApplicationError({
      message: 'Write action is not supported by assistant executor',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: { tool: input.toolName },
    });
  }

  private async executeReadAction(
    action: AssistantPlanAction,
    context: AssistantExecutionContext,
  ): Promise<AssistantActionExecutionSummary> {
    if (action.tool === 'search_orders') {
      const args = this.parseStrictToolArgs(searchOrdersArgsSchema, action.arguments, action.tool);
      const pagination = this.resolvePagination({ page: args.page, pageSize: args.pageSize });
      const result = await this.dependencies.ordersService.listOrders(
        {
          scope: context.scope,
          ...(args.search ? { search: args.search } : {}),
          sortBy: args.sortBy,
          sortDirection: args.sortDirection,
          statuses: args.status,
          ...(args.duration ? { duration: args.duration } : {}),
          serviceIds: args.service,
        },
        pagination,
      );

      return {
        actionId: action.id,
        tool: action.tool,
        status: 'executed',
        result: {
          items: result.items,
          meta: result.meta,
        },
      };
    }

    if (action.tool === 'get_order_details') {
      const args = this.parseStrictToolArgs(
        getOrderDetailsArgsSchema,
        action.arguments,
        action.tool,
      );
      const result = await this.dependencies.ordersService.getOrderById(args.orderId, context.scope);
      return {
        actionId: action.id,
        tool: action.tool,
        status: 'executed',
        result,
      };
    }

    if (action.tool === 'search_patients') {
      const args = this.parseStrictToolArgs(
        searchPatientsArgsSchema,
        action.arguments,
        action.tool,
      );
      const pagination = this.resolvePagination({ page: args.page, pageSize: args.pageSize });
      const result = await this.dependencies.patientService.listPatients(
        {
          scope: context.scope,
          ...(args.search ? { search: args.search } : {}),
          sortBy: args.sortBy,
          sortDirection: args.sortDirection,
          statuses: args.status,
        },
        pagination,
      );
      return {
        actionId: action.id,
        tool: action.tool,
        status: 'executed',
        result: {
          items: result.items,
          meta: result.meta,
        },
      };
    }

    if (action.tool === 'get_patient_details') {
      const args = this.parseStrictToolArgs(
        getPatientDetailsArgsSchema,
        action.arguments,
        action.tool,
      );
      const result = await this.dependencies.patientService.getPatientById(args.patientId, context.scope);
      return {
        actionId: action.id,
        tool: action.tool,
        status: 'executed',
        result,
      };
    }

    throw new ApplicationError({
      message: 'Read action is not supported by assistant executor',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: { tool: action.tool },
    });
  }

  private async executeCreateOrder(input: {
    actionId: string;
    toolName: string;
    payload: Record<string, unknown>;
    context: AssistantExecutionContext;
  }): Promise<AssistantActionExecutionSummary> {
    const args = this.parseStrictToolArgs(createOrderArgsSchema, input.payload, input.toolName);
    const payload = this.parseCreateOrderPayload(args.payload);
    const result = await this.dependencies.ordersService.createOrder(payload, input.context.scope);
    return {
      actionId: input.actionId,
      tool: input.toolName,
      status: 'executed',
      result,
    };
  }

  private async executeUpdateOrder(input: {
    actionId: string;
    toolName: string;
    payload: Record<string, unknown>;
    context: AssistantExecutionContext;
  }): Promise<AssistantActionExecutionSummary> {
    const args = this.parseStrictToolArgs(updateOrderArgsSchema, input.payload, input.toolName);
    const payload = this.parseUpdateOrderPayload(args.payload);
    if (Object.keys(payload).length === 0) {
      throw new ApplicationError({
        message: 'Update order payload must contain at least one field',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }

    const result = await this.dependencies.ordersService.updateOrder(
      args.orderId,
      payload,
      input.context.scope,
    );
    return {
      actionId: input.actionId,
      tool: input.toolName,
      status: 'executed',
      result,
    };
  }

  private resolvePagination(args: {
    page: number | undefined;
    pageSize: number | undefined;
  }): PaginationQuery {
    const parsed = paginationSchema.parse(args);
    return {
      page: parsed.page,
      pageSize: parsed.pageSize,
    };
  }

  private parseCreateOrderPayload(payload: Record<string, unknown>) {
    const schema = z
      .object({
        orderNumber: z.string().trim().min(1),
        patientId: z.string().trim().min(1),
        doctorId: z.string().trim().min(1),
        clinicId: z.string().trim().min(1),
        scanCenterId: z.string().trim().min(1).optional(),
        status: z.enum(ORDER_STATUS_VALUES),
        priority: z.enum(['Low', 'Normal', 'High', 'Urgent']),
        restoration: z.enum([
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
        ]),
        arch: z.enum(['Maxilla', 'Mandible', 'Both']),
        format: z.string().trim().min(1),
        shade: z.string().trim().min(1),
        units: z.coerce.number().int().min(1),
        amount: z.coerce.number().min(0),
        billed: z.boolean(),
        billedAmount: z.coerce.number().min(0).optional(),
        billTo: z.string().trim().min(1),
        vouchers: z.coerce.number().int().min(0),
        isLocked: z.boolean(),
        hasNotes: z.boolean(),
        notes: z.string(),
        archiveDate: z.coerce.date().optional(),
        receivedAt: z.coerce.date(),
        sentAt: z.coerce.date().optional(),
        chargedAt: z.coerce.date().optional(),
        dueDate: z.coerce.date(),
        changeRequestId: z.string().trim().min(1).optional(),
        csTask: z.string().trim().min(1).optional(),
        technicianId: z.string().trim().min(1).optional(),
        creationData: z
          .object({
            services: z.array(
              z.object({
                serviceId: z.string().trim().min(1),
                serviceDetails: z.record(z.string(), z.string()),
                serviceForm: z.record(z.string(), z.string()),
                selectedTeeth: z.array(z.number().int().min(1).max(99)),
                scanRequirements: z.array(z.string()),
                fileReferences: z.array(z.string()),
              }),
            ),
            communication: z
              .object({
                internalCaseNote: z.string(),
                internalCaseFiles: z.array(z.string()),
                sendMailTo: z.array(z.string()),
                sendIhTaskTo: z.string().optional(),
                rushTask: z.boolean(),
              })
              .optional(),
          })
          .optional(),
      })
      .strict();

    const parsed = this.parseStrictToolArgs(schema, payload, 'create_order.payload');
    return stripUndefined(parsed);
  }

  private parseUpdateOrderPayload(payload: Record<string, unknown>) {
    const schema = z
      .object({
        orderNumber: z.string().trim().min(1).optional(),
        patientId: z.string().trim().min(1).optional(),
        doctorId: z.string().trim().min(1).optional(),
        clinicId: z.string().trim().min(1).optional(),
        scanCenterId: z.string().trim().min(1).optional(),
        status: z.enum(ORDER_STATUS_VALUES).optional(),
        priority: z.enum(['Low', 'Normal', 'High', 'Urgent']).optional(),
        restoration: z
          .enum([
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
          ])
          .optional(),
        arch: z.enum(['Maxilla', 'Mandible', 'Both']).optional(),
        format: z.string().trim().min(1).optional(),
        shade: z.string().trim().min(1).optional(),
        units: z.coerce.number().int().min(1).optional(),
        amount: z.coerce.number().min(0).optional(),
        billed: z.boolean().optional(),
        billedAmount: z.coerce.number().min(0).optional(),
        billTo: z.string().trim().min(1).optional(),
        vouchers: z.coerce.number().int().min(0).optional(),
        isLocked: z.boolean().optional(),
        hasNotes: z.boolean().optional(),
        notes: z.string().optional(),
        archiveDate: z.coerce.date().nullable().optional(),
        receivedAt: z.coerce.date().optional(),
        sentAt: z.coerce.date().optional(),
        chargedAt: z.coerce.date().optional(),
        dueDate: z.coerce.date().optional(),
        changeRequestId: z.string().trim().min(1).optional(),
        csTask: z.string().trim().min(1).optional(),
        technicianId: z.string().trim().min(1).optional(),
      })
      .strict();

    const parsed = this.parseStrictToolArgs(schema, payload, 'update_order.payload');
    return stripUndefined(parsed);
  }

  private parseStrictToolArgs<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
    value: unknown,
    toolName: string,
  ): z.infer<TSchema> {
    const parsed = schema.safeParse(value);
    if (parsed.success) {
      return parsed.data;
    }

    throw new ApplicationError({
      message: 'Assistant tool arguments are invalid',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: {
        tool: toolName,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }
}

function containsDeleteOperation(toolName: string): boolean {
  return /delete|remove|truncate|drop/i.test(toolName);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, propertyValue]) => propertyValue !== undefined),
  ) as T;
}
