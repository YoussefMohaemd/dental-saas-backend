import { z } from 'zod';

import { type PaginationQuery } from '../../../shared/application/contracts/pagination';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { type ClinicService } from '../../clinics/application/clinic-service';
import { type DoctorService } from '../../doctors/application/doctor-service';
import { createClinicBodySchema, updateClinicBodySchema } from '../../clinics/presentation/clinics.schemas';
import { createDoctorBodySchema, updateDoctorBodySchema } from '../../doctors/presentation/doctors.schemas';
import { createPatientBodySchema, updatePatientBodySchema } from '../../patients/presentation/patients.schemas';
import { type OrdersService } from '../../orders/application/orders-service';
import { type PatientService } from '../../patients/application/patient-service';
import {
  ORDER_DURATION_VALUES,
  ORDER_LIST_SORT_FIELDS,
  ORDER_STATUS_VALUES,
  type OrderWritePayload,
} from '../../orders/domain/order';
import { type AssistantCatalogRepository } from './assistant-catalog';
import { type AssistantPlanAction, type AssistantToolDefinition } from '../domain/assistant.types';

export interface AssistantActionExecutionSummary {
  actionId: string;
  tool: string;
  status: 'executed' | 'failed';
  result?: unknown;
  error?: string;
}

interface AssistantActionExecutorDependencies {
  ordersService: OrdersService;
  patientService: PatientService;
  doctorService: DoctorService;
  clinicService: ClinicService;
  catalogRepository: AssistantCatalogRepository;
}

interface AssistantExecutionContext {
  scope: DataVisibilityScope;
  tenantId: string;
}

const emptyArgsSchema = z.object({}).strict();

const searchClinicsArgsSchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const searchDoctorsArgsSchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    clinicId: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const createEntityArgsSchema = z
  .object({
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

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
    overdue: z.boolean().optional(),
  })
  .strict();

const OPEN_ORDER_STATUSES: Array<(typeof ORDER_STATUS_VALUES)[number]> =
  ORDER_STATUS_VALUES.filter((status) => status !== 'Completed' && status !== 'Cancelled');

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

const updatePatientArgsSchema = z
  .object({
    patientId: z.string().trim().min(1),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

const updateDoctorArgsSchema = z
  .object({
    doctorId: z.string().trim().min(1),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

const updateClinicArgsSchema = z
  .object({
    clinicId: z.string().trim().min(1),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
const objectIdRegex = /^[a-f0-9]{24}$/i;
const createPatientAssistantPayloadSchema = z
  .object({
    name: z.string().trim().min(1),
    dob: z.coerce.date(),
    gender: z.enum(['M', 'F']),
    phone: z.string().trim().min(1),
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    clinicId: z.string().trim().min(1).optional(),
    clinicName: z.string().trim().min(1).optional(),
    clinicCity: z.string().trim().min(1).optional(),
    clinicAddress: z.string().trim().min(1).optional(),
    clinicPhone: z.string().trim().min(1).optional(),
    clinicEmail: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
    accountManager: z.string().trim().min(1).optional(),
    doctorId: z.string().trim().min(1).optional(),
    doctorName: z.string().trim().min(1).optional(),
    doctorSpecialty: z.string().trim().min(1).optional(),
    doctorPhone: z.string().trim().min(1).optional(),
    doctorEmail: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
    doctorGender: z.enum(['M', 'F']).optional(),
    status: z.enum(['Active', 'Inactive']).default('Active'),
    lastVisit: z.coerce.date().optional(),
  })
  .strict();

export class AssistantActionExecutor {
  public constructor(private readonly dependencies: AssistantActionExecutorDependencies) {}

  public async validateWriteActionDraft(input: {
    toolName: string;
    payload: Record<string, unknown>;
    context: AssistantExecutionContext;
  }): Promise<void> {
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
      const args = this.parseStrictToolArgs(createOrderArgsSchema, input.payload, input.toolName);
      await this.parseCreateOrderPayload(args.payload, input.context);
      return;
    }

    if (input.toolName === 'update_order') {
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
      return;
    }

    if (input.toolName === 'create_patient') {
      const args = this.parseStrictToolArgs(createEntityArgsSchema, input.payload, input.toolName);
      const payload = this.parseStrictToolArgs(
        createPatientAssistantPayloadSchema,
        args.payload,
        'create_patient.payload',
      );
      const { clinicId } = await this.resolveClinicForPatientPayload(payload, input.context.scope);
      const { doctorId } = await this.resolveDoctorForPatientPayload(
        payload,
        clinicId,
        input.context.scope,
      );
      this.parseStrictToolArgs(
        createPatientBodySchema,
        {
          name: payload.name,
          dob: payload.dob,
          gender: payload.gender,
          phone: payload.phone,
          email: payload.email,
          clinicId,
          doctorId,
          status: payload.status,
          lastVisit: payload.lastVisit ?? new Date(),
        },
        'create_patient.payload',
      );
      return;
    }

    if (input.toolName === 'create_doctor') {
      const args = this.parseStrictToolArgs(createEntityArgsSchema, input.payload, input.toolName);
      this.parseStrictToolArgs(createDoctorBodySchema, args.payload, 'create_doctor.payload');
      return;
    }

    if (input.toolName === 'create_clinic') {
      const args = this.parseStrictToolArgs(createEntityArgsSchema, input.payload, input.toolName);
      this.parseStrictToolArgs(createClinicBodySchema, args.payload, 'create_clinic.payload');
      return;
    }

    if (input.toolName === 'update_patient') {
      const args = this.parseStrictToolArgs(updatePatientArgsSchema, input.payload, input.toolName);
      const payload = this.parseStrictToolArgs(updatePatientBodySchema, args.payload, 'update_patient.payload');
      if (Object.keys(payload).length === 0) {
        throw new ApplicationError({
          message: 'Update patient payload must contain at least one field',
          statusCode: 400,
          code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
          expose: true,
        });
      }
      return;
    }

    if (input.toolName === 'update_doctor') {
      const args = this.parseStrictToolArgs(updateDoctorArgsSchema, input.payload, input.toolName);
      const payload = this.parseStrictToolArgs(updateDoctorBodySchema, args.payload, 'update_doctor.payload');
      if (Object.keys(payload).length === 0) {
        throw new ApplicationError({
          message: 'Update doctor payload must contain at least one field',
          statusCode: 400,
          code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
          expose: true,
        });
      }
      return;
    }

    if (input.toolName === 'update_clinic') {
      const args = this.parseStrictToolArgs(updateClinicArgsSchema, input.payload, input.toolName);
      const payload = this.parseStrictToolArgs(updateClinicBodySchema, args.payload, 'update_clinic.payload');
      if (Object.keys(payload).length === 0) {
        throw new ApplicationError({
          message: 'Update clinic payload must contain at least one field',
          statusCode: 400,
          code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
          expose: true,
        });
      }
      return;
    }

    throw new ApplicationError({
      message: 'Write action is not supported by assistant executor',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: { tool: input.toolName },
    });
  }

  public executeReadActions(
    actions: AssistantPlanAction[],
    toolByActionId: Map<string, AssistantToolDefinition>,
    context: AssistantExecutionContext,
  ): Promise<AssistantActionExecutionSummary[]> {
    const readActions = actions.filter((action) => {
      const tool = toolByActionId.get(action.id);
      return tool?.operationType === 'read';
    });

    return Promise.all(
      readActions.map(async (action): Promise<AssistantActionExecutionSummary> => {
        try {
          return await this.executeReadAction(action, context);
        } catch (error) {
          return {
            actionId: action.id,
            tool: action.tool,
            status: 'failed',
            error:
              error instanceof ApplicationError && error.expose
                ? error.message
                : 'The data could not be loaded.',
          };
        }
      }),
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

    if (
      input.toolName === 'create_patient' ||
      input.toolName === 'create_doctor' ||
      input.toolName === 'create_clinic'
    ) {
      return this.executeCreateEntity(input);
    }

    if (
      input.toolName === 'update_patient' ||
      input.toolName === 'update_doctor' ||
      input.toolName === 'update_clinic'
    ) {
      return this.executeUpdateEntity(input);
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
      const pagination = this.resolvePagination({
        page: args.page,
        pageSize: args.overdue ? (args.pageSize ?? 100) : args.pageSize,
      });
      const query = {
        scope: context.scope,
        ...(args.search ? { search: args.search } : {}),
        sortBy: args.overdue ? ('dueDate' as const) : args.sortBy,
        sortDirection: args.overdue ? ('asc' as const) : args.sortDirection,
        statuses: args.overdue
          ? args.status.length > 0
            ? args.status.filter((status) => OPEN_ORDER_STATUSES.includes(status))
            : [...OPEN_ORDER_STATUSES]
          : args.status,
        ...(args.duration ? { duration: args.duration } : {}),
        serviceIds: args.service,
      };

      const result = args.overdue
        ? await this.listOrdersAcrossAllPages(query, pagination)
        : await this.dependencies.ordersService.listOrders(query, pagination);

      const now = Date.now();
      const items = result.items.filter((item) => {
        if (!args.overdue) {
          return true;
        }
        return new Date(item.dueDate).getTime() < now;
      });

      return {
        actionId: action.id,
        tool: action.tool,
        status: 'executed',
        result: {
          items,
          meta: args.overdue
            ? {
                ...result.meta,
                totalItems: items.length,
                totalPages: Math.max(1, Math.ceil(items.length / Math.max(1, result.meta.pageSize))),
                overdueOnThisPage: items.length,
                overdueTotalItems: items.length,
              }
            : result.meta,
        },
      };
    }

    if (action.tool === 'get_order_details') {
      const args = this.parseStrictToolArgs(
        getOrderDetailsArgsSchema,
        action.arguments,
        action.tool,
      );
      const resolvedOrderId = await this.resolveOrderIdForDetails(args.orderId, context);
      const result = await this.dependencies.ordersService.getOrderById(
        resolvedOrderId,
        context.scope,
      );
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

    if (action.tool === 'list_services') {
      this.parseStrictToolArgs(emptyArgsSchema, action.arguments, action.tool);
      const services = await this.dependencies.catalogRepository.listServices(context.tenantId);
      return { actionId: action.id, tool: action.tool, status: 'executed', result: { services } };
    }

    if (action.tool === 'list_service_prices') {
      this.parseStrictToolArgs(emptyArgsSchema, action.arguments, action.tool);
      const services = await this.dependencies.catalogRepository.listServices(context.tenantId);
      return { actionId: action.id, tool: action.tool, status: 'executed', result: { services } };
    }

    if (action.tool === 'get_company_info') {
      this.parseStrictToolArgs(emptyArgsSchema, action.arguments, action.tool);
      const profile = await this.dependencies.catalogRepository.getCompanyProfile(context.tenantId);
      return { actionId: action.id, tool: action.tool, status: 'executed', result: { profile } };
    }

    if (action.tool === 'get_submission_standards') {
      this.parseStrictToolArgs(emptyArgsSchema, action.arguments, action.tool);
      const profile = await this.dependencies.catalogRepository.getCompanyProfile(context.tenantId);
      return {
        actionId: action.id,
        tool: action.tool,
        status: 'executed',
        result: { standards: profile?.submissionStandards ?? [] },
      };
    }

    if (action.tool === 'search_clinics') {
      const args = this.parseStrictToolArgs(searchClinicsArgsSchema, action.arguments, action.tool);
      const result = await this.dependencies.clinicService.listClinics(
        {
          scope: context.scope,
          ...(args.search ? { search: args.search } : {}),
          sortBy: 'name',
          sortDirection: 'asc',
          statuses: [],
        },
        this.resolvePagination({ page: args.page, pageSize: args.pageSize }),
      );
      return {
        actionId: action.id,
        tool: action.tool,
        status: 'executed',
        result: { items: result.items, meta: result.meta },
      };
    }

    if (action.tool === 'search_doctors') {
      const args = this.parseStrictToolArgs(searchDoctorsArgsSchema, action.arguments, action.tool);
      const result = await this.dependencies.doctorService.listDoctors(
        {
          scope: context.scope,
          ...(args.search ? { search: args.search } : {}),
          ...(args.clinicId ? { clinicId: args.clinicId } : {}),
          sortBy: 'name',
          sortDirection: 'asc',
          statuses: [],
        },
        this.resolvePagination({ page: args.page, pageSize: args.pageSize }),
      );
      return {
        actionId: action.id,
        tool: action.tool,
        status: 'executed',
        result: { items: result.items, meta: result.meta },
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

  private async executeCreateEntity(input: {
    actionId: string;
    toolName: string;
    payload: Record<string, unknown>;
    context: AssistantExecutionContext;
  }): Promise<AssistantActionExecutionSummary> {
    const args = this.parseStrictToolArgs(createEntityArgsSchema, input.payload, input.toolName);
    const { scope } = input.context;

    if (input.toolName === 'create_patient') {
      const payload = this.parseStrictToolArgs(
        createPatientAssistantPayloadSchema,
        args.payload,
        'create_patient.payload',
      );
      const { clinicId } = await this.resolveClinicForPatientPayload(payload, scope);
      const { doctorId } = await this.resolveDoctorForPatientPayload(payload, clinicId, scope);
      const body = this.parseStrictToolArgs(
        createPatientBodySchema,
        {
          name: payload.name,
          dob: payload.dob,
          gender: payload.gender,
          phone: payload.phone,
          email: payload.email,
          clinicId,
          doctorId,
          status: payload.status,
          lastVisit: payload.lastVisit ?? new Date(),
        },
        'create_patient.payload',
      );
      const result = await this.dependencies.patientService.createPatient(body, scope);
      return {
        actionId: input.actionId,
        tool: input.toolName,
        status: 'executed',
        result: { patient: result },
      };
    }

    if (input.toolName === 'create_doctor') {
      const body = this.parseStrictToolArgs(createDoctorBodySchema, args.payload, 'create_doctor.payload');
      const result = await this.dependencies.doctorService.createDoctor(body, scope);
      return { actionId: input.actionId, tool: input.toolName, status: 'executed', result };
    }

    const body = this.parseStrictToolArgs(createClinicBodySchema, args.payload, 'create_clinic.payload');
    const result = await this.dependencies.clinicService.createClinic(body, scope);
    return { actionId: input.actionId, tool: input.toolName, status: 'executed', result };
  }

  private async executeCreateOrder(input: {
    actionId: string;
    toolName: string;
    payload: Record<string, unknown>;
    context: AssistantExecutionContext;
  }): Promise<AssistantActionExecutionSummary> {
    const args = this.parseStrictToolArgs(createOrderArgsSchema, input.payload, input.toolName);
    const payload = await this.parseCreateOrderPayload(args.payload, input.context);
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

  private async executeUpdateEntity(input: {
    actionId: string;
    toolName: string;
    payload: Record<string, unknown>;
    context: AssistantExecutionContext;
  }): Promise<AssistantActionExecutionSummary> {
    const { scope } = input.context;

    if (input.toolName === 'update_patient') {
      const args = this.parseStrictToolArgs(updatePatientArgsSchema, input.payload, input.toolName);
      const payload = this.parseStrictToolArgs(updatePatientBodySchema, args.payload, 'update_patient.payload');
      if (Object.keys(payload).length === 0) {
        throw new ApplicationError({
          message: 'Update patient payload must contain at least one field',
          statusCode: 400,
          code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
          expose: true,
        });
      }
      const result = await this.dependencies.patientService.updatePatient(args.patientId, payload, scope);
      return { actionId: input.actionId, tool: input.toolName, status: 'executed', result };
    }

    if (input.toolName === 'update_doctor') {
      const args = this.parseStrictToolArgs(updateDoctorArgsSchema, input.payload, input.toolName);
      const payload = this.parseStrictToolArgs(updateDoctorBodySchema, args.payload, 'update_doctor.payload');
      if (Object.keys(payload).length === 0) {
        throw new ApplicationError({
          message: 'Update doctor payload must contain at least one field',
          statusCode: 400,
          code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
          expose: true,
        });
      }
      const result = await this.dependencies.doctorService.updateDoctor(args.doctorId, payload, scope);
      return { actionId: input.actionId, tool: input.toolName, status: 'executed', result };
    }

    const args = this.parseStrictToolArgs(updateClinicArgsSchema, input.payload, input.toolName);
    const payload = this.parseStrictToolArgs(updateClinicBodySchema, args.payload, 'update_clinic.payload');
    if (Object.keys(payload).length === 0) {
      throw new ApplicationError({
        message: 'Update clinic payload must contain at least one field',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }
    const result = await this.dependencies.clinicService.updateClinic(args.clinicId, payload, scope);
    return { actionId: input.actionId, tool: input.toolName, status: 'executed', result };
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

  private async resolveOrderIdForDetails(
    orderIdOrNumber: string,
    context: AssistantExecutionContext,
  ): Promise<string> {
    if (objectIdRegex.test(orderIdOrNumber)) {
      return orderIdOrNumber;
    }

    const candidates = await this.dependencies.ordersService.listOrders(
      {
        scope: context.scope,
        search: orderIdOrNumber,
        sortBy: 'createdAt',
        sortDirection: 'desc',
        statuses: [],
        serviceIds: [],
      },
      { page: 1, pageSize: 20 },
    );
    const exactMatch = candidates.items.find(
      (item) => item.orderNumber.toLowerCase() === orderIdOrNumber.toLowerCase(),
    );
    if (exactMatch) {
      return exactMatch.id;
    }

    throw new ApplicationError({
      message: `Order '${orderIdOrNumber}' was not found`,
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  private async parseCreateOrderPayload(
    payload: Record<string, unknown>,
    context: AssistantExecutionContext,
  ): Promise<OrderWritePayload> {
    const now = new Date();
    const defaultDueDate = new Date(now);
    defaultDueDate.setDate(defaultDueDate.getDate() + 7);

    const schema = z
      .object({
        orderNumber: z.string().trim().min(1).optional(),
        patientId: z.string().trim().min(1).optional(),
        patientName: z.string().trim().min(1).optional(),
        doctorId: z.string().trim().min(1).optional(),
        doctorName: z.string().trim().min(1).optional(),
        clinicId: z.string().trim().min(1).optional(),
        clinicName: z.string().trim().min(1).optional(),
        scanCenterId: z.string().trim().min(1).optional(),
        status: z.enum(ORDER_STATUS_VALUES).default('New'),
        priority: z.enum(['Low', 'Normal', 'High', 'Urgent']).default('Normal'),
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
          .default('Crown'),
        arch: z.enum(['Maxilla', 'Mandible', 'Both']).default('Both'),
        format: z.string().trim().min(1).default('STL'),
        shade: z.string().trim().min(1).default('A2'),
        units: z.coerce.number().int().min(1).default(1),
        amount: z.coerce.number().min(0).default(0),
        billed: z.boolean().default(false),
        billedAmount: z.coerce.number().min(0).optional(),
        billTo: z.string().trim().min(1).default('doctor'),
        vouchers: z.coerce.number().int().min(0).default(0),
        isLocked: z.boolean().default(false),
        hasNotes: z.boolean().optional(),
        notes: z.string().default(''),
        archiveDate: z.coerce.date().optional(),
        receivedAt: z.coerce.date().optional(),
        sentAt: z.coerce.date().optional(),
        chargedAt: z.coerce.date().optional(),
        dueDate: z.coerce.date().optional(),
        changeRequestId: z.string().trim().min(1).optional(),
        csTask: z.string().trim().min(1).optional(),
        technicianId: z.string().trim().min(1).optional(),
        creationData: z
          .object({
            services: z.array(
              z.object({
                serviceId: z.string().trim().min(1),
                serviceDetails: z.record(z.string(), z.string()).default({}),
                serviceForm: z.record(z.string(), z.string()).default({}),
                selectedTeeth: z.array(z.coerce.number().int().min(1).max(99)).default([]),
                scanRequirements: z.array(z.string()).default([]),
                fileReferences: z.array(z.string()).default([]),
              }),
            ),
            communication: z
              .object({
                internalCaseNote: z.string().default(''),
                internalCaseFiles: z.array(z.string()).default([]),
                sendMailTo: z.array(z.string()).default([]),
                sendIhTaskTo: z.string().optional(),
                rushTask: z.boolean().default(false),
              })
              .optional(),
          })
          .transform((value) => ({
            ...value,
            services: value.services ?? [],
          }))
          .optional(),
      })
      .strict();

    const parsed = this.parseStrictToolArgs(schema, payload, 'create_order.payload');
    const patientId = await this.resolvePatientId(
      parsed.patientId,
      parsed.patientName,
      context.scope,
    );
    const patient = await this.dependencies.patientService.getPatientById(patientId, context.scope);
    const patientDoctorId =
      typeof patient.doctorId === 'string' ? patient.doctorId.trim() : '';
    const patientClinicId =
      typeof patient.clinicId === 'string' ? patient.clinicId.trim() : '';
    const doctorId = await this.resolveDoctorId(
      patientDoctorId || parsed.doctorId,
      patientDoctorId ? undefined : parsed.doctorName,
      context.scope,
    );
    const doctor = await this.dependencies.doctorService.getDoctorById(doctorId, context.scope);
    const doctorClinicId =
      typeof (doctor as { clinicId?: unknown }).clinicId === 'string'
        ? (doctor as { clinicId: string }).clinicId.trim()
        : '';
    const clinicId = await this.resolveClinicId(
      doctorClinicId || patientClinicId || parsed.clinicId,
      doctorClinicId || patientClinicId ? undefined : parsed.clinicName,
      context.scope,
    );
    await this.dependencies.clinicService.getClinicById(clinicId, context.scope);

    return stripUndefined({
      ...parsed,
      patientId,
      doctorId,
      clinicId,
      orderNumber: parsed.orderNumber ?? this.buildAssistantOrderNumber(now),
      hasNotes: parsed.hasNotes ?? parsed.notes.trim().length > 0,
      receivedAt: parsed.receivedAt ?? now,
      dueDate: parsed.dueDate ?? defaultDueDate,
    }) as OrderWritePayload;
  }

  private buildAssistantOrderNumber(now: Date): string {
    const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const random = Math.floor(Math.random() * 10_000)
      .toString()
      .padStart(4, '0');
    return `AI-${stamp}-${random}`;
  }

  private async resolvePatientId(
    patientId: string | undefined,
    patientName: string | undefined,
    scope: DataVisibilityScope,
  ): Promise<string> {
    if (patientId && objectIdRegex.test(patientId)) {
      return patientId;
    }
    if (!patientName) {
      throw new ApplicationError({
        message: patientId
          ? 'create_order requires valid patientId or patientName'
          : 'create_order requires patientId or patientName',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }

    const result = await this.dependencies.patientService.listPatients(
      {
        scope,
        search: patientName,
        sortBy: 'createdAt',
        sortDirection: 'desc',
        statuses: [],
      },
      { page: 1, pageSize: 20 },
    );
    const exact = result.items.filter(
      (item) => item.name.trim().toLowerCase() === patientName.trim().toLowerCase(),
    );
    if (exact.length === 1) {
      const [match] = exact;
      if (match) {
        return match.id;
      }
    }
    if (exact.length > 1) {
      throw new ApplicationError({
        message: `Multiple patients match '${patientName}'. Please provide patientId.`,
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }
    throw new ApplicationError({
      message: `Patient '${patientName}' was not found`,
      statusCode: 404,
      code: APPLICATION_ERROR_CODES.NOT_FOUND,
      expose: true,
    });
  }

  private async resolveDoctorId(
    doctorId: string | undefined,
    doctorName: string | undefined,
    scope: DataVisibilityScope,
  ): Promise<string> {
    if (doctorId && objectIdRegex.test(doctorId)) {
      return doctorId;
    }
    if (doctorName) {
      const result = await this.dependencies.doctorService.listDoctors(
        {
          scope,
          search: doctorName,
          sortBy: 'createdAt',
          sortDirection: 'desc',
          statuses: [],
        },
        { page: 1, pageSize: 20 },
      );
      const exact = result.items.filter(
        (item) => item.name.trim().toLowerCase() === doctorName.trim().toLowerCase(),
      );
      if (exact.length === 1) {
        const [match] = exact;
        if (match) {
          return match.id;
        }
      }
      if (exact.length > 1) {
        throw new ApplicationError({
          message: `Multiple doctors match '${doctorName}'. Please provide doctorId.`,
          statusCode: 400,
          code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
          expose: true,
        });
      }
      throw new ApplicationError({
        message: `Doctor '${doctorName}' was not found`,
        statusCode: 404,
        code: APPLICATION_ERROR_CODES.NOT_FOUND,
        expose: true,
      });
    }
    if (doctorId) {
      throw new ApplicationError({
        message: 'create_order requires valid doctorId or doctorName',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }
    throw new ApplicationError({
      message: 'create_order requires doctorId or doctorName',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
  }

  private async resolveClinicId(
    clinicId: string | undefined,
    clinicName: string | undefined,
    scope: DataVisibilityScope,
  ): Promise<string> {
    if (clinicId && objectIdRegex.test(clinicId)) {
      return clinicId;
    }
    if (clinicName) {
      const result = await this.dependencies.clinicService.listClinics(
        {
          scope,
          search: clinicName,
          sortBy: 'createdAt',
          sortDirection: 'desc',
          statuses: [],
        },
        { page: 1, pageSize: 20 },
      );
      const exact = result.items.filter(
        (item) => item.name.trim().toLowerCase() === clinicName.trim().toLowerCase(),
      );
      if (exact.length === 1) {
        const [match] = exact;
        if (match) {
          return match.id;
        }
      }
      if (exact.length > 1) {
        throw new ApplicationError({
          message: `Multiple clinics match '${clinicName}'. Please provide clinicId.`,
          statusCode: 400,
          code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
          expose: true,
        });
      }
      throw new ApplicationError({
        message: `Clinic '${clinicName}' was not found`,
        statusCode: 404,
        code: APPLICATION_ERROR_CODES.NOT_FOUND,
        expose: true,
      });
    }
    if (clinicId) {
      throw new ApplicationError({
        message: 'create_order requires valid clinicId or clinicName',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }
    throw new ApplicationError({
      message: 'create_order requires clinicId or clinicName',
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
    });
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

  private async resolveClinicForPatientPayload(
    payload: z.infer<typeof createPatientAssistantPayloadSchema>,
    scope: DataVisibilityScope,
  ): Promise<{ clinicId: string }> {
    if (payload.clinicId) {
      return { clinicId: payload.clinicId };
    }

    if (!payload.clinicName) {
      throw new ApplicationError({
        message: 'create_patient requires clinicId or clinicName',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }

    const clinics = await this.dependencies.clinicService.listClinics(
      {
        scope,
        search: payload.clinicName,
        sortBy: 'name',
        sortDirection: 'asc',
        statuses: [],
      },
      { page: 1, pageSize: 20 },
    );
    const exact = clinics.items.find(
      (clinic) => clinic.name.toLowerCase() === payload.clinicName?.toLowerCase(),
    );
    if (exact) {
      return { clinicId: exact.id };
    }

    throw new ApplicationError({
      message: `Clinic name "${payload.clinicName}" was not found. Create the clinic first or provide a valid clinicId.`,
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: {
        clinicName: payload.clinicName,
      },
    });
  }

  private async resolveDoctorForPatientPayload(
    payload: z.infer<typeof createPatientAssistantPayloadSchema>,
    clinicId: string,
    scope: DataVisibilityScope,
  ): Promise<{ doctorId: string }> {
    if (payload.doctorId) {
      return { doctorId: payload.doctorId };
    }

    if (!payload.doctorName) {
      throw new ApplicationError({
        message: 'create_patient requires doctorId or doctorName',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
      });
    }

    const doctors = await this.dependencies.doctorService.listDoctors(
      {
        scope,
        search: payload.doctorName,
        clinicId,
        sortBy: 'name',
        sortDirection: 'asc',
        statuses: [],
      },
      { page: 1, pageSize: 20 },
    );
    const exact = doctors.items.find(
      (doctor) => doctor.name.toLowerCase() === payload.doctorName?.toLowerCase(),
    );
    if (exact) {
      return { doctorId: exact.id };
    }

    throw new ApplicationError({
      message: `Doctor name "${payload.doctorName}" was not found in the selected clinic. Create the doctor first or provide a valid doctorId.`,
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: {
        doctorName: payload.doctorName,
        clinicId,
      },
    });
  }

  private async listOrdersAcrossAllPages(
    query: Parameters<OrdersService['listOrders']>[0],
    pagination: PaginationQuery,
  ): Promise<Awaited<ReturnType<OrdersService['listOrders']>>> {
    const firstPage = await this.dependencies.ordersService.listOrders(query, pagination);
    const items = [...firstPage.items];
    const totalPages = Math.max(firstPage.meta.totalPages, 1);

    for (let page = pagination.page + 1; page <= totalPages; page += 1) {
      const pageResult = await this.dependencies.ordersService.listOrders(query, {
        page,
        pageSize: pagination.pageSize,
      });
      items.push(...pageResult.items);
    }

    return {
      items,
      meta: {
        ...firstPage.meta,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    };
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
