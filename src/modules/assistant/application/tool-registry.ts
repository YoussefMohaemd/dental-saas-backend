import { type DentalCapability } from '../../auth/application/authorization-policy';
import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import {
  type AssistantToolDefinition,
  type AssistantToolParameters,
} from '../domain/assistant.types';
import { ORDER_RESTORATION_VALUES } from '../../orders/domain/order';

const createOrderParameters: AssistantToolParameters = {
  type: 'object',
  properties: {
    payload: {
      type: 'object',
      description:
        'Order fields. Use canonical IDs when available; patientName, doctorName, clinicName, and serviceName are accepted for bilingual resolution.',
      properties: {
        patientId: { type: 'string', description: 'Canonical patient ID' },
        patientName: { type: 'string', description: 'Patient name in Arabic or English' },
        doctorId: { type: 'string', description: 'Canonical doctor ID' },
        doctorName: { type: 'string', description: 'Doctor name in Arabic or English' },
        clinicId: { type: 'string', description: 'Canonical clinic ID' },
        clinicName: { type: 'string', description: 'Clinic name in Arabic or English' },
        status: {
          type: 'string',
          enum: [
            'New',
            'Review',
            'Design',
            'Production',
            'Quality Check',
            'Ready',
            'Completed',
            'Cancelled',
          ],
        },
        priority: { type: 'string', enum: ['Low', 'Normal', 'High', 'Urgent'] },
        restoration: { type: 'string', enum: [...ORDER_RESTORATION_VALUES] },
        arch: { type: 'string', enum: ['Maxilla', 'Mandible', 'Both'] },
        notes: { type: 'string', description: 'Preserve the user-provided notes verbatim' },
        creationData: {
          type: 'object',
          properties: {
            services: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  serviceId: { type: 'string', description: 'Canonical service ID' },
                  serviceName: { type: 'string', description: 'Service name in Arabic or English' },
                },
              },
            },
          },
        },
      },
    },
  },
  additionalProperties: false,
};

const searchOrdersParameters: AssistantToolParameters = {
  type: 'object',
  properties: {
    search: {
      type: 'string',
      description: 'Free-text keyword: order number, patient, doctor, or clinic name',
    },
    patientName: {
      type: 'string',
      description: 'Patient name in Arabic or English (mapped to order search)',
    },
    doctorName: {
      type: 'string',
      description: 'Doctor name in Arabic or English (mapped to order search)',
    },
    clinicName: {
      type: 'string',
      description: 'Clinic name in Arabic or English (mapped to order search)',
    },
    status: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'New',
          'Review',
          'Design',
          'Production',
          'Quality Check',
          'Ready',
          'Completed',
          'Cancelled',
        ],
      },
    },
    duration: {
      type: 'string',
      enum: ['today', 'week', 'month', '2-months', '3-months', '6-months'],
    },
    service: { type: 'array', items: { type: 'string' } },
    overdue: { type: 'boolean' },
    sortBy: {
      type: 'string',
      enum: [
        'orderNumber',
        'status',
        'priority',
        'restoration',
        'receivedAt',
        'dueDate',
        'amount',
        'createdAt',
        'updatedAt',
      ],
    },
    sortDirection: { type: 'string', enum: ['asc', 'desc'] },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 },
  },
  additionalProperties: false,
};

const updateOrderParameters: AssistantToolParameters = {
  type: 'object',
  properties: {
    orderId: { type: 'string', description: 'Canonical order ID or order number' },
    payload: createOrderParameters.properties?.payload ?? {
      type: 'object',
    },
  },
  additionalProperties: false,
};

const updatePatientParameters: AssistantToolParameters = {
  type: 'object',
  properties: {
    patientId: {
      type: 'string',
      description: 'Canonical patient ID; takes precedence over patientName',
    },
    patientName: { type: 'string', description: 'Patient name in Arabic or English' },
    payload: {
      type: 'object',
      description: 'Only patient fields to change; preserve user-provided values',
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

const updateDoctorParameters: AssistantToolParameters = {
  type: 'object',
  properties: {
    doctorId: {
      type: 'string',
      description: 'Canonical doctor ID; takes precedence over doctorName',
    },
    doctorName: { type: 'string', description: 'Doctor name in Arabic or English' },
    payload: {
      type: 'object',
      description: 'Only doctor fields to change; preserve user-provided values',
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

const updateClinicParameters: AssistantToolParameters = {
  type: 'object',
  properties: {
    clinicId: {
      type: 'string',
      description: 'Canonical clinic ID; takes precedence over clinicName',
    },
    clinicName: { type: 'string', description: 'Clinic name in Arabic or English' },
    payload: {
      type: 'object',
      description: 'Only clinic fields to change; preserve user-provided values',
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

const createPatientParameters: AssistantToolParameters = {
  type: 'object',
  properties: {
    payload: {
      type: 'object',
      description: 'Complete patient data using real values, not invented placeholders',
      properties: {
        name: { type: 'string' },
        dob: { type: 'string', description: 'YYYY-MM-DD' },
        gender: { type: 'string', enum: ['M', 'F'] },
        phone: { type: 'string' },
        email: { type: 'string' },
        clinicId: { type: 'string', description: 'Canonical clinic ID' },
        clinicName: { type: 'string', description: 'Clinic name in Arabic or English' },
        doctorId: { type: 'string', description: 'Canonical doctor ID' },
        doctorName: { type: 'string', description: 'Doctor name in Arabic or English' },
      },
    },
  },
  additionalProperties: false,
};

const createDoctorParameters: AssistantToolParameters = {
  type: 'object',
  properties: {
    payload: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        gender: { type: 'string', enum: ['M', 'F'] },
        specialty: { type: 'string' },
        clinicId: { type: 'string', description: 'Canonical clinic ID' },
        email: { type: 'string' },
        phone: { type: 'string' },
        joinedDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
    },
  },
  additionalProperties: false,
};

const createClinicParameters: AssistantToolParameters = {
  type: 'object',
  properties: {
    payload: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: { type: 'string' },
        city: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        accountManager: { type: 'string' },
      },
    },
  },
  additionalProperties: false,
};

const ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  createTool(
    'search_orders',
    'Search orders by filters and keywords, including patient, doctor, or clinic names in Arabic, English, or transliteration',
    '{"search"?: string (order number, patient/doctor/clinic name, Arabic text, English text, or common transliteration variants such as sief/Saif), "patientName"?: string (Arabic or English), "doctorName"?: string (Arabic or English), "clinicName"?: string (Arabic or English), "status"?: string[] using "New"|"Review"|"Design"|"Production"|"Quality Check"|"Ready"|"Completed"|"Cancelled", "duration"?: "today"|"week"|"month"|"2-months"|"3-months"|"6-months", "service"?: string[], "overdue"?: boolean (true = open orders past their due date, for late-order reports), "sortBy"?: "orderNumber"|"status"|"priority"|"restoration"|"receivedAt"|"dueDate"|"amount"|"createdAt"|"updatedAt", "sortDirection"?: "asc"|"desc", "page"?: integer, "pageSize"?: integer}',
    'read',
    ['orders.read'],
    { domain: 'orders', action: 'search' },
    searchOrdersParameters,
  ),
  createTool(
    'get_order_details',
    'Get order details by order ID, order number, or a patient name when it identifies a unique order; use search_orders when multiple orders match',
    '{"orderId": string (order ID, order number, or patient name for one unique order; transliteration is supported)}',
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
    createOrderParameters,
  ),
  createTool(
    'update_order',
    'Update an existing order',
    '{"orderId": string, "payload": object containing only the order fields to change}',
    'write',
    ['orders.update'],
    { domain: 'orders', action: 'update' },
    updateOrderParameters,
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
    'list_service_prices',
    'List every company service with its price only',
    '{}',
    'read',
    [],
    { domain: 'catalog', action: 'list_service_prices' },
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
    'get_submission_standards',
    'Get only the submission standards from company profile',
    '{}',
    'read',
    [],
    { domain: 'catalog', action: 'submission_standards' },
  ),
  createTool(
    'search_clinics',
    'Search clinics by name or city (use it to resolve a clinic name to its id)',
    '{"search"?: string, "page"?: integer, "pageSize"?: integer}',
    'read',
    ['clinics.read'],
    { domain: 'clinics', action: 'search' },
    {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Clinic name or city to search for' },
        page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
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
    createPatientParameters,
  ),
  createTool(
    'update_patient',
    'Update an existing patient',
    '{"patientId"?: string, "patientName"?: string, "payload": object containing only patient fields to change; provide one target field}',
    'write',
    ['patients.update'],
    { domain: 'patients', action: 'update' },
    updatePatientParameters,
  ),
  createTool(
    'create_doctor',
    'Create a new doctor',
    '{"payload": {"name": string, "gender"?: "M"|"F", "specialty": string, "clinicId": string, "email": string, "phone": string, "joinedDate": "YYYY-MM-DD"}}',
    'write',
    ['doctors.manage'],
    { domain: 'doctors', action: 'create' },
    createDoctorParameters,
  ),
  createTool(
    'update_doctor',
    'Update an existing doctor',
    '{"doctorId"?: string, "doctorName"?: string, "payload": object containing only doctor fields to change; provide one target field}',
    'write',
    ['doctors.manage'],
    { domain: 'doctors', action: 'update' },
    updateDoctorParameters,
  ),
  createTool(
    'create_clinic',
    'Create a new clinic',
    '{"payload": {"name": string, "address": string, "city": string, "phone": string, "email": string, "accountManager": string}}',
    'write',
    ['clinics.manage'],
    { domain: 'clinics', action: 'create' },
    createClinicParameters,
  ),
  createTool(
    'update_clinic',
    'Update an existing clinic',
    '{"clinicId"?: string, "clinicName"?: string, "payload": object containing only clinic fields to change; provide one target field}',
    'write',
    ['clinics.manage'],
    { domain: 'clinics', action: 'update' },
    updateClinicParameters,
  ),
];

export interface AssistantToolRegistry {
  list(): AssistantToolDefinition[];
  get(name: string): AssistantToolDefinition;
}

export function buildAssistantToolRegistry(options?: {
  createToolsEnabled?: boolean;
}): AssistantToolRegistry {
  const createToolsEnabled = options?.createToolsEnabled ?? true;
  const toolsByName = new Map<string, AssistantToolDefinition>();
  const tools = ASSISTANT_TOOLS.filter(
    (tool) => createToolsEnabled || !tool.name.startsWith('create_'),
  );
  for (const tool of tools) {
    toolsByName.set(tool.name, tool);
  }

  return {
    list: () => [...tools],
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
  parameters?: AssistantToolDefinition['parameters'],
): AssistantToolDefinition {
  return {
    name,
    description,
    argumentsHint,
    ...(parameters ? { parameters } : {}),
    operationType,
    requiredCapabilities,
    capabilityMatchMode: 'all',
    requiresConfirmation: operationType === 'write',
    timeoutMs: 20_000,
    auditMetadata,
  };
}
