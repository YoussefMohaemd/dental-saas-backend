import { type DentalCapability } from '../../auth/application/authorization-policy';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { type AssistantToolDefinition } from '../domain/assistant.types';

const ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  createTool(
    'search_orders',
    'Search orders by filters and keywords',
    '{"search"?: string, "status"?: string[] using "New"|"Review"|"Design"|"Production"|"Quality Check"|"Ready"|"Completed"|"Cancelled", "duration"?: "today"|"week"|"month"|"2-months"|"3-months"|"6-months", "service"?: string[], "sortBy"?: "orderNumber"|"status"|"priority"|"restoration"|"receivedAt"|"dueDate"|"amount"|"createdAt"|"updatedAt", "sortDirection"?: "asc"|"desc", "page"?: integer, "pageSize"?: integer}',
    'read',
    ['orders.read'],
    { domain: 'orders', action: 'search' },
  ),
  createTool(
    'get_order_details',
    'Get order details by order id',
    '{"orderId": string}',
    'read',
    ['orders.read'],
    { domain: 'orders', action: 'details' },
  ),
  createTool(
    'create_order',
    'Create a new order draft',
    '{"payload": object containing order fields}',
    'write',
    ['orders.create'],
    { domain: 'orders', action: 'create' },
  ),
  createTool(
    'update_order',
    'Update an existing order',
    '{"orderId": string, "payload": object containing only the order fields to change}',
    'write',
    ['orders.update'],
    { domain: 'orders', action: 'update' },
  ),
  createTool(
    'search_patients',
    'Search patients',
    '{"search"?: string, "status"?: string[] using "Active"|"Inactive", "sortBy"?: "name"|"dob"|"gender"|"status"|"lastVisit"|"createdAt"|"updatedAt", "sortDirection"?: "asc"|"desc", "page"?: integer, "pageSize"?: integer}',
    'read',
    ['patients.read'],
    { domain: 'patients', action: 'search' },
  ),
  createTool(
    'get_patient_details',
    'Get patient details by id',
    '{"patientId": string}',
    'read',
    ['patients.read'],
    { domain: 'patients', action: 'details' },
  ),
  createTool(
    'list_services',
    'List every company service with its price, turnaround and a short description',
    '{}',
    'read',
    [],
    { domain: 'catalog', action: 'list_services' },
  ),
  createTool(
    'get_company_info',
    'Get the company profile: who we are, contact details, working hours and submission standards',
    '{}',
    'read',
    [],
    { domain: 'catalog', action: 'company_info' },
  ),
  createTool(
    'search_clinics',
    'Search clinics by name or city (use it to resolve a clinic name to its id)',
    '{"search"?: string, "page"?: integer, "pageSize"?: integer}',
    'read',
    ['clinics.read'],
    { domain: 'clinics', action: 'search' },
  ),
  createTool(
    'search_doctors',
    'Search doctors by name or specialty (use it to resolve a doctor name to its id)',
    '{"search"?: string, "clinicId"?: string, "page"?: integer, "pageSize"?: integer}',
    'read',
    ['doctors.read'],
    { domain: 'doctors', action: 'search' },
  ),
  createTool(
    'create_patient',
    'Create a new patient',
    '{"payload": {"name": string, "dob": "YYYY-MM-DD", "gender": "M"|"F", "phone": string, "email": string, "clinicId"?: string, "clinicName"?: string, "doctorId"?: string, "doctorName"?: string, "lastVisit"?: "YYYY-MM-DD"}}',
    'write',
    ['patients.create'],
    { domain: 'patients', action: 'create' },
  ),
  createTool(
    'create_doctor',
    'Create a new doctor',
    '{"payload": {"name": string, "gender"?: "M"|"F", "specialty": string, "clinicId": string, "email": string, "phone": string, "joinedDate": "YYYY-MM-DD"}}',
    'write',
    ['doctors.manage'],
    { domain: 'doctors', action: 'create' },
  ),
  createTool(
    'create_clinic',
    'Create a new clinic',
    '{"payload": {"name": string, "address": string, "city": string, "phone": string, "email": string, "accountManager": string}}',
    'write',
    ['clinics.manage'],
    { domain: 'clinics', action: 'create' },
  ),
];

export interface AssistantToolRegistry {
  list(): AssistantToolDefinition[];
  get(name: string): AssistantToolDefinition;
}

export function buildAssistantToolRegistry(): AssistantToolRegistry {
  const toolsByName = new Map<string, AssistantToolDefinition>();
  for (const tool of ASSISTANT_TOOLS) {
    toolsByName.set(tool.name, tool);
  }

  return {
    list: () => [...ASSISTANT_TOOLS],
    get: (name: string) => {
      const tool = toolsByName.get(name);
      if (tool) {
        return tool;
      }

      throw new ApplicationError({
        message: 'Unknown assistant tool',
        statusCode: 400,
        code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
        expose: true,
        details: { tool: name },
      });
    },
  };
}

function createTool(
  name: string,
  description: string,
  argumentsHint: string,
  operationType: AssistantToolDefinition['operationType'],
  requiredCapabilities: DentalCapability[],
  auditMetadata: AssistantToolDefinition['auditMetadata'],
): AssistantToolDefinition {
  return {
    name,
    description,
    argumentsHint,
    operationType,
    requiredCapabilities,
    capabilityMatchMode: 'all',
    requiresConfirmation: operationType === 'write',
    timeoutMs: 20_000,
    auditMetadata,
  };
}
