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
