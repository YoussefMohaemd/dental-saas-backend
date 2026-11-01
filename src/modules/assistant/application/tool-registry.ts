import { type DentalCapability } from '../../auth/application/authorization-policy';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { type AssistantToolDefinition } from '../domain/assistant.types';

const ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  createTool('search_orders', 'Search orders by filters and keywords', 'read', ['orders.read'], {
    domain: 'orders',
    action: 'search',
  }),
  createTool('get_order_details', 'Get order details by order id', 'read', ['orders.read'], {
    domain: 'orders',
    action: 'details',
  }),
  createTool('create_order', 'Create a new order draft', 'write', ['orders.create'], {
    domain: 'orders',
    action: 'create',
  }),
  createTool('update_order', 'Update an existing order', 'write', ['orders.update'], {
    domain: 'orders',
    action: 'update',
  }),
  createTool(
    'search_sub_orders',
    'Search sub-orders for an order or service',
    'read',
    ['orders.read'],
    {
      domain: 'sub-orders',
      action: 'search',
    },
  ),
  createTool(
    'get_sub_order_details',
    'Get a single sub-order details',
    'read',
    ['orders.read'],
    {
      domain: 'sub-orders',
      action: 'details',
    },
  ),
  createTool(
    'create_sub_order',
    'Create new sub-orders for an existing order',
    'write',
    ['orders.subOrders.manage'],
    {
      domain: 'sub-orders',
      action: 'create',
    },
  ),
  createTool(
    'update_sub_order',
    'Update existing sub-order data',
    'write',
    ['orders.subOrders.update'],
    {
      domain: 'sub-orders',
      action: 'update',
    },
  ),
  createTool('search_patients', 'Search patients', 'read', ['patients.read'], {
    domain: 'patients',
    action: 'search',
  }),
  createTool('get_patient_details', 'Get patient details by id', 'read', ['patients.read'], {
    domain: 'patients',
    action: 'details',
  }),
  createTool('create_patient', 'Create a new patient', 'write', ['patients.create'], {
    domain: 'patients',
    action: 'create',
  }),
  createTool('update_patient', 'Update patient profile data', 'write', ['patients.update'], {
    domain: 'patients',
    action: 'update',
  }),
  createTool('search_doctors', 'Search doctors', 'read', ['doctors.read'], {
    domain: 'doctors',
    action: 'search',
  }),
  createTool('get_doctor_details', 'Get doctor details by id', 'read', ['doctors.read'], {
    domain: 'doctors',
    action: 'details',
  }),
  createTool('search_clinics', 'Search clinics', 'read', ['clinics.read'], {
    domain: 'clinics',
    action: 'search',
  }),
  createTool('get_clinic_details', 'Get clinic details by id', 'read', ['clinics.read'], {
    domain: 'clinics',
    action: 'details',
  }),
  createTool('get_reports_overview', 'Get reports overview', 'read', ['reports.read'], {
    domain: 'reports',
    action: 'overview',
  }),
  createTool('generate_orders_report', 'Generate orders range report', 'read', ['reports.read'], {
    domain: 'reports',
    action: 'orders-range',
  }),
  createTool('generate_order_report', 'Generate report for a single order', 'read', ['reports.read'], {
    domain: 'reports',
    action: 'order',
  }),
  createTool(
    'generate_sub_orders_report',
    'Generate sub-orders operational report',
    'read',
    ['reports.read'],
    {
      domain: 'reports',
      action: 'sub-orders',
    },
  ),
  createTool('get_team_performance', 'Get team performance report', 'read', ['reports.read'], {
    domain: 'reports',
    action: 'team-performance',
  }),
  createTool('get_quarterly_targets', 'Get quarterly targets report', 'read', ['reports.read'], {
    domain: 'reports',
    action: 'quarterly-targets',
  }),
  createTool(
    'get_dashboard_summary',
    'Get dashboard summary and weekly volume',
    'read',
    ['dashboard.read'],
    {
      domain: 'dashboard',
      action: 'summary',
    },
  ),
  createTool('get_dashboard_statistics', 'Get dashboard statistics', 'read', ['dashboard.read'], {
    domain: 'dashboard',
    action: 'statistics',
  }),
  createTool('search_cases', 'Search cases', 'read', ['cases.read'], {
    domain: 'cases',
    action: 'search',
  }),
  createTool('get_case_details', 'Get case details by id', 'read', ['cases.read'], {
    domain: 'cases',
    action: 'details',
  }),
  createTool('create_case', 'Create a new case', 'write', ['cases.create'], {
    domain: 'cases',
    action: 'create',
  }),
  createTool('get_billing_records', 'List billing records', 'read', ['billing.read'], {
    domain: 'billing',
    action: 'list',
  }),
  createTool('get_billing_summary', 'Get billing summary', 'read', ['billing.read'], {
    domain: 'billing',
    action: 'summary',
  }),
  createTool('update_billing_record', 'Update billing record state', 'write', ['billing.update'], {
    domain: 'billing',
    action: 'update',
  }),
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
  operationType: AssistantToolDefinition['operationType'],
  requiredCapabilities: DentalCapability[],
  auditMetadata: AssistantToolDefinition['auditMetadata'],
): AssistantToolDefinition {
  return {
    name,
    description,
    operationType,
    requiredCapabilities,
    capabilityMatchMode: 'all',
    requiresConfirmation: operationType === 'write',
    timeoutMs: 20_000,
    auditMetadata,
  };
}
