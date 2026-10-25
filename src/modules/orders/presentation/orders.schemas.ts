import { z } from 'zod';

import { ORDER_ARCH_VALUES, ORDER_DURATION_VALUES, ORDER_LIST_SORT_FIELDS, ORDER_PRIORITY_VALUES, ORDER_RESTORATION_VALUES, ORDER_STATUS_VALUES } from '../domain/order';
import { SUB_ORDER_PRIORITY_VALUES, SUB_ORDER_STATUS_VALUES } from '../domain/sub-order';

const stringField = z.string().trim().min(1);
const listFromMixedValue = <TValue extends string>(itemSchema: z.ZodType<TValue>) => z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return [];
    }

    if (typeof value === 'string') {
      return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
    }

    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .flatMap((item) => item.split(','))
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }

    return [];
  },
  z.array(itemSchema),
);

const orderStatusSchema = z.enum(ORDER_STATUS_VALUES);
const orderPrioritySchema = z.enum(ORDER_PRIORITY_VALUES);
const orderArchSchema = z.enum(ORDER_ARCH_VALUES);
const orderRestorationSchema = z.enum(ORDER_RESTORATION_VALUES);
const subOrderStatusSchema = z.enum(SUB_ORDER_STATUS_VALUES);
const subOrderPrioritySchema = z.enum(SUB_ORDER_PRIORITY_VALUES);

const subOrderCreationDataSchema = z.object({
  serviceId: stringField,
  serviceDetails: z.record(z.string(), z.string()).default({}),
  serviceForm: z.record(z.string(), z.string()).default({}),
  selectedTeeth: z.array(z.coerce.number().int().min(1).max(99)).default([]),
  scanRequirements: z.array(stringField).default([]),
  fileReferences: z.array(stringField).default([]),
}).strict();

const subOrderFormItemSchema = z.object({
  id: stringField,
  label: stringField,
  required: z.boolean(),
  status: z.enum(['complete', 'incomplete', 'optional']),
  value: z.object({
    values: z.record(z.string(), z.string()),
    context: z.object({
      orderId: stringField,
      orderNumber: stringField,
      subOrderId: stringField,
      service: stringField,
      patientName: z.string(),
      doctorName: z.string(),
      clinicName: z.string(),
      selectedTeeth: z.array(z.coerce.number().int().min(1).max(99)),
      caseNotes: z.string(),
    }).strict(),
    updatedAt: z.string().datetime(),
  }).strict().optional(),
}).strict();

const subOrderScanItemSchema = z.object({
  id: stringField,
  label: stringField,
  format: stringField,
  status: z.enum(['uploaded', 'missing', 'optional', 'selected-local']),
  localFiles: z.array(z.object({
    id: stringField,
    name: stringField,
    sizeBytes: z.coerce.number().int().min(0),
    sizeLabel: stringField,
    type: z.string(),
    lastModified: z.coerce.number().min(0),
    selectedAt: z.string().datetime(),
  }).strict()).optional(),
  updatedAt: z.string().datetime().optional(),
}).strict();

const subOrderActivityItemSchema = z.object({
  time: stringField,
  user: stringField,
  text: stringField,
}).strict();

const subOrderDetailFields = {
  forms: z.array(subOrderFormItemSchema).optional(),
  scans: z.array(subOrderScanItemSchema).optional(),
  activity: z.array(subOrderActivityItemSchema).optional(),
};

const orderCreationDataSchema = z.object({
  services: z.array(subOrderCreationDataSchema).default([]),
  communication: z.object({
    internalCaseNote: z.string().default(''),
    internalCaseFiles: z.array(stringField).default([]),
    sendMailTo: z.array(stringField).default([]),
    sendIhTaskTo: stringField.optional(),
    rushTask: z.boolean().default(false),
  }).strict().optional(),
}).strict();

export const orderIdParamsSchema = z.object({
  orderId: stringField,
});

export const orderAndSubOrderParamsSchema = z.object({
  orderId: stringField,
  subOrderId: stringField,
});

export const ordersListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sortBy: z.enum(ORDER_LIST_SORT_FIELDS).default('createdAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  status: listFromMixedValue(orderStatusSchema).default([]),
  duration: z.enum(ORDER_DURATION_VALUES).optional(),
  service: listFromMixedValue(stringField).default([]),
  includeSubOrders: z.coerce.boolean().optional(),
});

export const createOrderBodySchema = z.object({
  orderNumber: stringField,
  patientId: stringField,
  doctorId: stringField,
  clinicId: stringField,
  scanCenterId: stringField.optional(),
  status: orderStatusSchema.default('New'),
  priority: orderPrioritySchema.default('Normal'),
  restoration: orderRestorationSchema,
  arch: orderArchSchema,
  format: stringField,
  shade: stringField,
  units: z.coerce.number().int().min(1),
  amount: z.coerce.number().min(0),
  billed: z.boolean().default(false),
  billedAmount: z.coerce.number().min(0).optional(),
  billTo: stringField,
  vouchers: z.coerce.number().int().min(0).default(0),
  isLocked: z.boolean().default(false),
  hasNotes: z.boolean().default(false),
  notes: z.string().default(''),
  archiveDate: z.coerce.date().optional(),
  receivedAt: z.coerce.date(),
  sentAt: z.coerce.date().optional(),
  chargedAt: z.coerce.date().optional(),
  dueDate: z.coerce.date(),
  changeRequestId: stringField.optional(),
  csTask: z.string().trim().min(1).optional(),
  technicianId: stringField.optional(),
  creationData: orderCreationDataSchema.optional(),
}).strict();

export const updateOrderBodySchema = z
  .object({
    orderNumber: stringField.optional(),
    patientId: stringField.optional(),
    doctorId: stringField.optional(),
    clinicId: stringField.optional(),
    scanCenterId: stringField.optional(),
    status: orderStatusSchema.optional(),
    priority: orderPrioritySchema.optional(),
    restoration: orderRestorationSchema.optional(),
    arch: orderArchSchema.optional(),
    format: stringField.optional(),
    shade: stringField.optional(),
    units: z.coerce.number().int().min(1).optional(),
    amount: z.coerce.number().min(0).optional(),
    billed: z.boolean().optional(),
    billedAmount: z.coerce.number().min(0).optional(),
    billTo: stringField.optional(),
    vouchers: z.coerce.number().int().min(0).optional(),
    isLocked: z.boolean().optional(),
    hasNotes: z.boolean().optional(),
    notes: z.string().optional(),
    archiveDate: z.coerce.date().nullable().optional(),
    receivedAt: z.coerce.date().optional(),
    sentAt: z.coerce.date().optional(),
    chargedAt: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    changeRequestId: stringField.optional(),
    csTask: z.string().trim().min(1).optional(),
    technicianId: stringField.optional(),
    creationData: orderCreationDataSchema.optional(),
  })
  .strict();

export const createSubOrderBodySchema = z.object({
  service: stringField,
  icon: z.string().default(''),
  status: subOrderStatusSchema.default('pending'),
  formsComplete: z.coerce.number().int().min(0).default(0),
  formsTotal: z.coerce.number().int().min(0).default(0),
  scansComplete: z.coerce.number().int().min(0).default(0),
  scansTotal: z.coerce.number().int().min(0).default(0),
  teeth: z.array(z.coerce.number().int().min(1).max(99)).default([]),
  priority: subOrderPrioritySchema.default('Normal'),
  dueDate: z.coerce.date(),
  notes: z.string().default(''),
  creationData: subOrderCreationDataSchema.optional(),
  ...subOrderDetailFields,
}).strict();

export const createSubOrdersBodySchema = z.array(createSubOrderBodySchema);

export const updateSubOrderBodySchema = z
  .object({
    service: stringField.optional(),
    icon: z.string().optional(),
    status: subOrderStatusSchema.optional(),
    formsComplete: z.coerce.number().int().min(0).optional(),
    formsTotal: z.coerce.number().int().min(0).optional(),
    scansComplete: z.coerce.number().int().min(0).optional(),
    scansTotal: z.coerce.number().int().min(0).optional(),
    teeth: z.array(z.coerce.number().int().min(1).max(99)).optional(),
    priority: subOrderPrioritySchema.optional(),
    dueDate: z.coerce.date().optional(),
    notes: z.string().optional(),
    creationData: subOrderCreationDataSchema.optional(),
    ...subOrderDetailFields,
  })
  .strict();
