type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type OpenApiObject = Record<string, unknown>;

interface EndpointSpec {
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  authenticated?: boolean;
  requiredRoles?: string[];
  parameters?: OpenApiObject[];
  requestBody?: OpenApiObject;
  successStatus?: 200 | 201 | 204;
  successDescription?: string;
  successSchema?: OpenApiObject;
}

const jsonContentType = 'application/json';

const bearerSecurity = [{ bearerAuth: [] }];

const commonParameters = {
  tenantIdHeader: {
    name: 'x-tenant-id',
    in: 'header',
    required: false,
    description: 'Tenant scope. Optional for routes that infer tenant from auth context.',
    schema: { type: 'string' },
  },
  userIdHeader: {
    name: 'x-user-id',
    in: 'header',
    required: false,
    description: 'Current user identifier, used by notification filtering routes.',
    schema: { type: 'string' },
  },
  search: {
    name: 'search',
    in: 'query',
    required: false,
    schema: { type: 'string' },
  },
  page: {
    name: 'page',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  pageSize: {
    name: 'pageSize',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 20, maximum: 200 },
  },
  sortBy: {
    name: 'sortBy',
    in: 'query',
    required: false,
    schema: { type: 'string' },
  },
  sortDirection: {
    name: 'sortDirection',
    in: 'query',
    required: false,
    schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
  },
  status: {
    name: 'status',
    in: 'query',
    required: false,
    description: 'Single status value or comma-separated list of statuses.',
    schema: { type: 'string' },
  },
  type: {
    name: 'type',
    in: 'query',
    required: false,
    description: 'Single type value or comma-separated list of types.',
    schema: { type: 'string' },
  },
  from: {
    name: 'from',
    in: 'query',
    required: false,
    schema: { type: 'string', format: 'date-time' },
  },
  to: {
    name: 'to',
    in: 'query',
    required: false,
    schema: { type: 'string', format: 'date-time' },
  },
} as const;

const endpoints: EndpointSpec[] = [
  {
    method: 'post',
    path: '/api/auth/login',
    tag: 'auth',
    summary: 'Authenticate user credentials',
    requestBody: {
      required: true,
      content: {
        [jsonContentType]: {
          schema: {
            type: 'object',
            required: ['tenantId', 'email', 'password'],
            properties: {
              tenantId: { type: 'string' },
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 8, maxLength: 128 },
              rememberMe: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/api/auth/refresh',
    tag: 'auth',
    summary: 'Refresh access token using refresh cookie',
    successSchema: {
      type: 'object',
      additionalProperties: true,
    },
  },
  {
    method: 'post',
    path: '/api/auth/logout',
    tag: 'auth',
    summary: 'Logout and clear refresh cookie',
    successStatus: 204,
    successDescription: 'Logged out successfully.',
  },
  {
    method: 'get',
    path: '/api/auth/me',
    tag: 'auth',
    summary: 'Get current authenticated principal',
    authenticated: true,
  },
  {
    method: 'post',
    path: '/api/auth/sessions/revoke',
    tag: 'auth',
    summary: 'Revoke all active sessions for current user',
    authenticated: true,
    requiredRoles: ['admin'],
    successStatus: 204,
    successDescription: 'Sessions revoked successfully.',
  },
  {
    method: 'get',
    path: '/api/health',
    tag: 'health',
    summary: 'Get health snapshot',
  },

  { method: 'get', path: '/api/v1/users', tag: 'users', summary: 'List users', authenticated: true },
  {
    method: 'get',
    path: '/api/v1/users/{userId}',
    tag: 'users',
    summary: 'Get user by id',
    authenticated: true,
    parameters: [createPathParam('userId', 'User identifier')],
  },
  {
    method: 'post',
    path: '/api/v1/users',
    tag: 'users',
    summary: 'Create user',
    authenticated: true,
    requiredRoles: ['admin'],
    requestBody: genericBody(),
    successStatus: 201,
    successDescription: 'User created successfully.',
  },
  {
    method: 'patch',
    path: '/api/v1/users/{userId}/role-status',
    tag: 'users',
    summary: 'Update user role/status',
    authenticated: true,
    requiredRoles: ['admin'],
    parameters: [createPathParam('userId', 'User identifier')],
    requestBody: genericBody(),
  },
  {
    method: 'post',
    path: '/api/v1/users/{userId}/deactivate',
    tag: 'users',
    summary: 'Deactivate user',
    authenticated: true,
    requiredRoles: ['admin'],
    parameters: [createPathParam('userId', 'User identifier')],
  },
  {
    method: 'post',
    path: '/api/v1/users/{userId}/reactivate',
    tag: 'users',
    summary: 'Reactivate user',
    authenticated: true,
    requiredRoles: ['admin'],
    parameters: [createPathParam('userId', 'User identifier')],
  },

  { method: 'get', path: '/api/v1/clinics', tag: 'clinics', summary: 'List clinics' },
  {
    method: 'post',
    path: '/api/v1/clinics',
    tag: 'clinics',
    summary: 'Create clinic',
    requestBody: genericBody(),
    successStatus: 201,
    successDescription: 'Clinic created successfully.',
  },
  {
    method: 'get',
    path: '/api/v1/clinics/{clinicId}',
    tag: 'clinics',
    summary: 'Get clinic by id',
    parameters: [createPathParam('clinicId', 'Clinic identifier')],
  },
  {
    method: 'patch',
    path: '/api/v1/clinics/{clinicId}',
    tag: 'clinics',
    summary: 'Update clinic',
    parameters: [createPathParam('clinicId', 'Clinic identifier')],
    requestBody: genericBody(),
  },
  {
    method: 'delete',
    path: '/api/v1/clinics/{clinicId}',
    tag: 'clinics',
    summary: 'Delete clinic',
    parameters: [createPathParam('clinicId', 'Clinic identifier')],
    successStatus: 204,
    successDescription: 'Clinic deleted successfully.',
  },

  { method: 'get', path: '/api/v1/doctors', tag: 'doctors', summary: 'List doctors' },
  {
    method: 'post',
    path: '/api/v1/doctors',
    tag: 'doctors',
    summary: 'Create doctor',
    requestBody: genericBody(),
    successStatus: 201,
    successDescription: 'Doctor created successfully.',
  },
  {
    method: 'get',
    path: '/api/v1/doctors/{doctorId}',
    tag: 'doctors',
    summary: 'Get doctor by id',
    parameters: [createPathParam('doctorId', 'Doctor identifier')],
  },
  {
    method: 'patch',
    path: '/api/v1/doctors/{doctorId}',
    tag: 'doctors',
    summary: 'Update doctor',
    parameters: [createPathParam('doctorId', 'Doctor identifier')],
    requestBody: genericBody(),
  },
  {
    method: 'delete',
    path: '/api/v1/doctors/{doctorId}',
    tag: 'doctors',
    summary: 'Delete doctor',
    parameters: [createPathParam('doctorId', 'Doctor identifier')],
    successStatus: 204,
    successDescription: 'Doctor deleted successfully.',
  },

  { method: 'get', path: '/api/v1/patients', tag: 'patients', summary: 'List patients' },
  {
    method: 'post',
    path: '/api/v1/patients',
    tag: 'patients',
    summary: 'Create patient',
    requestBody: genericBody(),
    successStatus: 201,
    successDescription: 'Patient created successfully.',
  },
  {
    method: 'get',
    path: '/api/v1/patients/{patientId}',
    tag: 'patients',
    summary: 'Get patient by id',
    parameters: [createPathParam('patientId', 'Patient identifier')],
  },
  {
    method: 'patch',
    path: '/api/v1/patients/{patientId}',
    tag: 'patients',
    summary: 'Update patient',
    parameters: [createPathParam('patientId', 'Patient identifier')],
    requestBody: genericBody(),
  },
  {
    method: 'delete',
    path: '/api/v1/patients/{patientId}',
    tag: 'patients',
    summary: 'Delete patient',
    parameters: [createPathParam('patientId', 'Patient identifier')],
    successStatus: 204,
    successDescription: 'Patient deleted successfully.',
  },

  { method: 'get', path: '/api/v1/orders', tag: 'orders', summary: 'List orders' },
  {
    method: 'post',
    path: '/api/v1/orders',
    tag: 'orders',
    summary: 'Create order',
    requestBody: genericBody(),
    successStatus: 201,
    successDescription: 'Order created successfully.',
  },
  {
    method: 'get',
    path: '/api/v1/orders/{orderId}',
    tag: 'orders',
    summary: 'Get order by id',
    parameters: [createPathParam('orderId', 'Order identifier')],
  },
  {
    method: 'patch',
    path: '/api/v1/orders/{orderId}',
    tag: 'orders',
    summary: 'Update order',
    parameters: [createPathParam('orderId', 'Order identifier')],
    requestBody: genericBody(),
  },
  {
    method: 'delete',
    path: '/api/v1/orders/{orderId}',
    tag: 'orders',
    summary: 'Delete order',
    parameters: [createPathParam('orderId', 'Order identifier')],
    successStatus: 204,
    successDescription: 'Order deleted successfully.',
  },
  {
    method: 'get',
    path: '/api/v1/orders/{orderId}/sub-orders',
    tag: 'sub-orders',
    summary: 'List sub-orders for order',
    parameters: [createPathParam('orderId', 'Order identifier')],
  },
  {
    method: 'post',
    path: '/api/v1/orders/{orderId}/sub-orders',
    tag: 'sub-orders',
    summary: 'Create sub-orders for order',
    parameters: [createPathParam('orderId', 'Order identifier')],
    requestBody: genericBody(),
    successStatus: 201,
    successDescription: 'Sub-orders created successfully.',
  },
  {
    method: 'put',
    path: '/api/v1/orders/{orderId}/sub-orders',
    tag: 'sub-orders',
    summary: 'Replace sub-orders for order',
    parameters: [createPathParam('orderId', 'Order identifier')],
    requestBody: genericBody(),
  },
  {
    method: 'get',
    path: '/api/v1/orders/{orderId}/sub-orders/{subOrderId}',
    tag: 'sub-orders',
    summary: 'Get sub-order by id',
    parameters: [
      createPathParam('orderId', 'Order identifier'),
      createPathParam('subOrderId', 'Sub-order identifier'),
    ],
  },
  {
    method: 'patch',
    path: '/api/v1/orders/{orderId}/sub-orders/{subOrderId}',
    tag: 'sub-orders',
    summary: 'Update sub-order',
    parameters: [
      createPathParam('orderId', 'Order identifier'),
      createPathParam('subOrderId', 'Sub-order identifier'),
    ],
    requestBody: genericBody(),
  },
  {
    method: 'delete',
    path: '/api/v1/orders/{orderId}/sub-orders/{subOrderId}',
    tag: 'sub-orders',
    summary: 'Delete sub-order',
    parameters: [
      createPathParam('orderId', 'Order identifier'),
      createPathParam('subOrderId', 'Sub-order identifier'),
    ],
    successStatus: 204,
    successDescription: 'Sub-order deleted successfully.',
  },

  { method: 'get', path: '/api/v1/cases', tag: 'cases', summary: 'List cases' },
  {
    method: 'get',
    path: '/api/v1/cases/{caseId}',
    tag: 'cases',
    summary: 'Get case by id',
    parameters: [createPathParam('caseId', 'Case identifier')],
  },

  { method: 'get', path: '/api/v1/billing', tag: 'billing', summary: 'List billing records' },
  {
    method: 'get',
    path: '/api/v1/billing/{recordId}',
    tag: 'billing',
    summary: 'Get billing record by id',
    parameters: [createPathParam('recordId', 'Billing record identifier')],
  },
  {
    method: 'patch',
    path: '/api/v1/billing/{recordId}',
    tag: 'billing',
    summary: 'Update billing record',
    parameters: [createPathParam('recordId', 'Billing record identifier')],
    requestBody: genericBody(),
  },

  { method: 'get', path: '/api/v1/change-requests', tag: 'change-requests', summary: 'List change requests' },
  {
    method: 'get',
    path: '/api/v1/change-requests/{requestId}',
    tag: 'change-requests',
    summary: 'Get change request by id',
    parameters: [createPathParam('requestId', 'Change request identifier')],
  },
  {
    method: 'patch',
    path: '/api/v1/change-requests/{requestId}/status',
    tag: 'change-requests',
    summary: 'Approve or reject change request',
    parameters: [createPathParam('requestId', 'Change request identifier')],
    requestBody: genericBody(),
  },

  { method: 'get', path: '/api/v1/scan-centers', tag: 'scan-centers', summary: 'List scan centers' },
  {
    method: 'get',
    path: '/api/v1/scan-centers/{scanCenterId}',
    tag: 'scan-centers',
    summary: 'Get scan center by id',
    parameters: [createPathParam('scanCenterId', 'Scan center identifier')],
  },

  { method: 'get', path: '/api/v1/dashboard/volume', tag: 'reports', summary: 'Get dashboard volume metrics' },
  { method: 'get', path: '/api/v1/reports/overview', tag: 'reports', summary: 'Get reports overview metrics' },
  {
    method: 'get',
    path: '/api/v1/reports/orders-range',
    tag: 'reports',
    summary: 'List orders-range report entries',
  },
  {
    method: 'get',
    path: '/api/v1/reports/quarterly-targets',
    tag: 'reports',
    summary: 'Get quarterly targets by query parameters',
  },
  {
    method: 'get',
    path: '/api/v1/reports/quarterly-targets/{year}/{quarter}',
    tag: 'reports',
    summary: 'Get quarterly targets by route parameters',
    parameters: [
      {
        name: 'year',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 2000, maximum: 3000 },
      },
      {
        name: 'quarter',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1, maximum: 4 },
      },
    ],
  },
  { method: 'get', path: '/api/v1/reports/team-performance', tag: 'reports', summary: 'Get team performance report' },

  { method: 'get', path: '/api/v1/documents', tag: 'documents', summary: 'List documents' },
  {
    method: 'get',
    path: '/api/v1/documents/{documentId}',
    tag: 'documents',
    summary: 'Get document by id',
    parameters: [createPathParam('documentId', 'Document identifier')],
  },
  {
    method: 'post',
    path: '/api/v1/documents',
    tag: 'documents',
    summary: 'Create document',
    requestBody: genericBody(),
    successStatus: 201,
    successDescription: 'Document created successfully.',
  },
  {
    method: 'delete',
    path: '/api/v1/documents/{documentId}',
    tag: 'documents',
    summary: 'Delete document',
    parameters: [createPathParam('documentId', 'Document identifier')],
    successStatus: 204,
    successDescription: 'Document deleted successfully.',
  },

  { method: 'get', path: '/api/v1/notifications', tag: 'notifications', summary: 'List notifications' },
  {
    method: 'post',
    path: '/api/v1/notifications/{notificationId}/read',
    tag: 'notifications',
    summary: 'Mark notification as read',
    parameters: [createPathParam('notificationId', 'Notification identifier')],
  },
  {
    method: 'post',
    path: '/api/v1/notifications/read-all',
    tag: 'notifications',
    summary: 'Mark all notifications as read',
  },

  {
    method: 'get',
    path: '/api/v1/settings/reference-data',
    tag: 'settings',
    summary: 'Get reference datasets for settings-dependent views',
  },
];

const listQueryPaths = new Set([
  '/api/v1/users',
  '/api/v1/clinics',
  '/api/v1/doctors',
  '/api/v1/patients',
  '/api/v1/orders',
  '/api/v1/cases',
  '/api/v1/billing',
  '/api/v1/change-requests',
  '/api/v1/scan-centers',
  '/api/v1/reports/orders-range',
  '/api/v1/documents',
  '/api/v1/notifications',
]);

const tagDescriptions: Record<string, string> = {
  auth: 'Authentication, token, and session management.',
  users: 'User directory and role/status lifecycle.',
  clinics: 'Clinic management endpoints.',
  doctors: 'Doctor management endpoints.',
  patients: 'Patient management endpoints.',
  orders: 'Order lifecycle endpoints.',
  'sub-orders': 'Sub-order endpoints nested under orders.',
  cases: 'Case listing and retrieval endpoints.',
  billing: 'Billing retrieval and status update endpoints.',
  'change-requests': 'Change request review and decision endpoints.',
  'scan-centers': 'Scan center operational dashboards.',
  reports: 'Business reporting and dashboard metrics.',
  documents: 'Document management endpoints.',
  notifications: 'Notification inbox and read markers.',
  settings: 'Reference data endpoints.',
  health: 'Service health probes.',
};

export function createOpenApiDocument(): OpenApiObject {
  const paths: Record<string, Record<string, OpenApiObject>> = {};

  for (const endpoint of endpoints) {
    const operation = createOperation(endpoint);
    const existing = paths[endpoint.path] ?? {};
    existing[endpoint.method] = operation;
    paths[endpoint.path] = existing;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Dental SaaS Backend API',
      version: '1.0.0',
      description:
        'OpenAPI specification generated from the Express route surface. Auth-protected operations require a bearer access token.',
    },
    servers: [{ url: '/', description: 'Current deployment host' }],
    tags: Object.entries(tagDescriptions).map(([name, description]) => ({ name, description })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token returned by /api/auth/login or /api/auth/refresh.',
        },
      },
      schemas: {
        RequestMeta: {
          type: 'object',
          properties: {
            requestId: { type: 'string' },
            pagination: { $ref: '#/components/schemas/PaginationMeta' },
          },
          additionalProperties: false,
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            totalItems: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
          additionalProperties: true,
        },
        ApiSuccessEnvelope: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {},
            meta: { $ref: '#/components/schemas/RequestMeta' },
          },
        },
        ApiErrorEnvelope: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object', additionalProperties: true },
              },
            },
            meta: { $ref: '#/components/schemas/RequestMeta' },
          },
        },
      },
      responses: {
        BadRequest: createErrorResponse('Request validation or parsing failed.'),
        Unauthorized: createErrorResponse('Authentication is required or token is invalid.'),
        Forbidden: createErrorResponse('Authenticated user does not have required permissions.'),
        NotFound: createErrorResponse('Requested resource was not found.'),
      },
    },
  };
}

function createOperation(endpoint: EndpointSpec): OpenApiObject {
  const parameters = [...(endpoint.parameters ?? [])];

  if (endpoint.path.startsWith('/api/v1') && !endpoint.path.startsWith('/api/v1/settings/')) {
    parameters.push(commonParameters.tenantIdHeader);
  }

  if (endpoint.path.startsWith('/api/v1/notifications')) {
    parameters.push(commonParameters.userIdHeader);
  }

  if (listQueryPaths.has(endpoint.path) && endpoint.method === 'get') {
    parameters.push(
      commonParameters.search,
      commonParameters.page,
      commonParameters.pageSize,
      commonParameters.sortBy,
      commonParameters.sortDirection,
    );
  }

  if (endpoint.path === '/api/v1/cases' || endpoint.path === '/api/v1/billing' || endpoint.path === '/api/v1/change-requests') {
    parameters.push(commonParameters.status);
  }

  if (endpoint.path === '/api/v1/notifications') {
    parameters.push(commonParameters.type);
    parameters.push({
      name: 'read',
      in: 'query',
      required: false,
      schema: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['true', 'false'] }] },
    });
  }

  if (endpoint.path === '/api/v1/billing') {
    parameters.push(
      { ...commonParameters.from, name: 'dateFrom' },
      { ...commonParameters.to, name: 'dateTo' },
    );
  }

  if (endpoint.path === '/api/v1/reports/orders-range') {
    parameters.push(commonParameters.from, commonParameters.to);
  }

  if (endpoint.path === '/api/v1/reports/quarterly-targets') {
    parameters.push(
      {
        name: 'year',
        in: 'query',
        required: true,
        schema: { type: 'integer', minimum: 2000, maximum: 3000 },
      },
      {
        name: 'quarter',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 4 },
      },
    );
  }

  if (endpoint.path === '/api/v1/settings/reference-data') {
    parameters.push({
      name: 'include',
      in: 'query',
      required: false,
      description: 'Comma-separated sections: scanCenters, quarterlyTargets, teamMembers.',
      schema: { type: 'string' },
    });
  }

  const operation: OpenApiObject = {
    tags: [endpoint.tag],
    summary: endpoint.summary,
    description: buildOperationDescription(endpoint),
    responses: buildResponses(endpoint),
  };

  if (endpoint.authenticated) {
    operation.security = bearerSecurity;
  }

  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  if (endpoint.requestBody) {
    operation.requestBody = endpoint.requestBody;
  }

  if (endpoint.requiredRoles && endpoint.requiredRoles.length > 0) {
    operation['x-required-roles'] = endpoint.requiredRoles;
  }

  return operation;
}

function buildResponses(endpoint: EndpointSpec): OpenApiObject {
  const status = endpoint.successStatus ?? 200;
  const responses: OpenApiObject = {
    '400': { $ref: '#/components/responses/BadRequest' },
    '401': { $ref: '#/components/responses/Unauthorized' },
    '403': { $ref: '#/components/responses/Forbidden' },
    '404': { $ref: '#/components/responses/NotFound' },
  };

  if (status === 204) {
    responses['204'] = {
      description: endpoint.successDescription ?? 'No content.',
    };
    return responses;
  }

  responses[String(status)] = {
    description: endpoint.successDescription ?? 'Successful response.',
    content: {
      [jsonContentType]: {
        schema: endpoint.successSchema ?? { $ref: '#/components/schemas/ApiSuccessEnvelope' },
      },
    },
  };

  return responses;
}

function buildOperationDescription(endpoint: EndpointSpec): string | undefined {
  const roleDescription =
    endpoint.requiredRoles && endpoint.requiredRoles.length > 0
      ? `Required roles: ${endpoint.requiredRoles.join(', ')}.`
      : undefined;

  return [endpoint.description, roleDescription].filter(Boolean).join('\n\n') || undefined;
}

function createErrorResponse(description: string): OpenApiObject {
  return {
    description,
    content: {
      [jsonContentType]: {
        schema: {
          $ref: '#/components/schemas/ApiErrorEnvelope',
        },
      },
    },
  };
}

function createPathParam(name: string, description: string): OpenApiObject {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'string' },
  };
}

function genericBody(): OpenApiObject {
  return {
    required: true,
    content: {
      [jsonContentType]: {
        schema: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  };
}
