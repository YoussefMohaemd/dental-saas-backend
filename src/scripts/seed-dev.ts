import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import mongoose, { Types } from 'mongoose';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { PasswordHasher } from '../modules/auth/application/password-hasher';
import { registerPersistenceModels } from '../shared/infrastructure/persistence/mongoose';
import { generatedSeedData } from './generated-seed-data';

interface ClinicSeed {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  status: 'Active' | 'Inactive';
  accountManager: string;
}

interface DoctorSeed {
  id: string;
  lookupId?: string;
  name: string;
  specialty: string;
  clinicId: string;
  email: string;
  phone: string;
  status: 'Active' | 'Inactive';
  joinedDate: string;
  avatar?: string;
}

interface PatientSeed {
  id: string;
  name: string;
  dob: string;
  gender: 'M' | 'F';
  phone: string;
  email: string;
  clinicId: string;
  doctorId: string;
  status: 'Active' | 'Inactive';
  lastVisit: string;
}

interface OrderSeed {
  id: string;
  orderNumber: string;
  patientId: string;
  doctorId: string;
  clinicId: string;
  scanCenterId?: string | null;
  status: string;
  priority: string;
  restoration: string;
  arch: string;
  format: string;
  shade: string;
  units: number;
  amount: number;
  billed: boolean;
  billTo: string;
  vouchers: number;
  isLocked: boolean;
  hasNotes: boolean;
  notes?: string;
  archiveDate?: string | null;
  receivedAt: string;
  sentAt?: string | null;
  chargedAt?: string | null;
  dueDate: string;
  csTask?: string | null;
  technicianName?: string | null;
}

interface SubOrderSeed {
  id: string;
  orderId: string;
  service: string;
  icon?: string;
  status: 'done' | 'in-progress' | 'pending' | 'blocked';
  formsComplete: number;
  formsTotal: number;
  scansComplete: number;
  scansTotal: number;
  teeth: number[];
  priority: string;
  dueDate: string;
  notes?: string;
}

interface CaseSeed {
  id: string;
  caseNumber: string;
  title: string;
  patientId: string;
  doctorId: string;
  clinicId: string;
  status: string;
  priority: string;
  ordersCount: number;
  filesCount: number;
  createdAt?: string;
  updatedAt?: string;
  notes?: string;
}

interface BillingSeed {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate: string;
  paidDate?: string | null;
  vouchers?: number;
  notes?: string;
}

interface ChangeRequestSeed {
  id: string;
  requestNumber: string;
  orderId: string;
  requester: string;
  status: string;
  priority: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DocumentSeed {
  id: string;
  name: string;
  category: string;
  type: string;
  size: string;
  date: string;
  doctor?: string;
}

interface NotificationSeed {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt?: string;
  relatedId?: string;
  relatedType?: string;
}

interface ScanCenterSeed {
  id: string;
}

const toObjectId = (value: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(value);
const fixedTenantId = toObjectId('66f100000000000000000001');
const fixedAdminUserId = toObjectId('66f100000000000000000005');
const fixedTechnicianUserId = toObjectId('66f100000000000000000006');
const fixedPlatformAdminAliasId = toObjectId('66f100000000000000000007');

const passwordHasher = new PasswordHasher();

const seedDataDirectory = resolve(
  __dirname,
  '..',
  '..',
  'seed-data',
);

function readSeedDataFile<T>(fileName: string): T {
  const filePath = resolve(seedDataDirectory, fileName);
  if (!existsSync(filePath)) {
    const generated = generatedSeedData[fileName];
    if (generated === undefined) {
      throw new Error(`Seed data file not found: ${filePath}`);
    }
    return generated as T;
  }
  const content = readFileSync(filePath, 'utf8');
  return JSON.parse(content) as T;
}

function objectIdFromSeed(namespace: string, sourceId: string): Types.ObjectId {
  const hex = createHash('sha1').update(`${namespace}:${sourceId}`).digest('hex').slice(0, 24);
  return new Types.ObjectId(hex);
}

function optionalDate(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function requiredDate(value: string | null | undefined, fieldName: string): Date {
  const parsed = optionalDate(value);
  if (!parsed) {
    throw new Error(`Invalid date value for ${fieldName}`);
  }

  return parsed;
}

function sizeToBytes(value: string): number {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/);
  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === 'GB'
      ? 1024 * 1024 * 1024
      : unit === 'MB'
        ? 1024 * 1024
        : unit === 'KB'
          ? 1024
          : 1;

  return Math.round(amount * multiplier);
}

function emailLocalPartFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 48) || 'user';
}

function buildUniqueEmail(baseLocalPart: string, usedEmails: Set<string>): string {
  let candidate = `${baseLocalPart}@example.test`;
  let counter = 1;
  while (usedEmails.has(candidate)) {
    candidate = `${baseLocalPart}.${counter}@example.test`;
    counter += 1;
  }
  usedEmails.add(candidate);
  return candidate;
}

const seedDevelopmentData = async (): Promise<void> => {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed development data while NODE_ENV=production');
  }

  const clinicsSource = readSeedDataFile<ClinicSeed[]>('clinics.json');
  const doctorsSource = readSeedDataFile<DoctorSeed[]>('doctors.json');
  const patientsSource = readSeedDataFile<PatientSeed[]>('patients.json');
  const ordersSource = readSeedDataFile<OrderSeed[]>('orders.json');
  const subOrdersSource = readSeedDataFile<SubOrderSeed[]>('sub-orders.json');
  const casesSource = readSeedDataFile<CaseSeed[]>('cases.json');
  const billingSource = readSeedDataFile<BillingSeed[]>('billing.json');
  const changeRequestsSource = readSeedDataFile<ChangeRequestSeed[]>('change-requests.json');
  const documentsSource = readSeedDataFile<DocumentSeed[]>('documents.json');
  const notificationsSource = readSeedDataFile<NotificationSeed[]>('notifications.json');
  const scanCentersSource = readSeedDataFile<ScanCenterSeed[]>('scan-centers.json');

  const {
    clinics,
    doctors,
    patients,
    users,
    orders,
    subOrders,
    cases,
    billingRecords,
    changeRequests,
    documents,
    notifications,
  } = registerPersistenceModels();

  const defaultPasswordHash = await passwordHasher.hash('ChangeMe123!');

  await mongoose.connect(env.MONGODB_URI);
  logger.info(
    { database: env.MONGODB_URI },
    'Connected to MongoDB for development seeding (Angular data import)',
  );

  const clinicIdMap = new Map(clinicsSource.map((item) => [item.id, objectIdFromSeed('clinic', item.id)]));
  const doctorIdMap = new Map(doctorsSource.map((item) => [item.id, objectIdFromSeed('doctor', item.id)]));
  const patientIdMap = new Map(patientsSource.map((item) => [item.id, objectIdFromSeed('patient', item.id)]));
  const orderIdMap = new Map(ordersSource.map((item) => [item.id, objectIdFromSeed('order', item.id)]));
  const subOrderIdMap = new Map(subOrdersSource.map((item) => [item.id, objectIdFromSeed('sub-order', item.id)]));
  const caseIdMap = new Map(casesSource.map((item) => [item.id, objectIdFromSeed('case', item.id)]));
  const billingIdMap = new Map(billingSource.map((item) => [item.id, objectIdFromSeed('billing', item.id)]));
  const changeRequestIdMap = new Map(
    changeRequestsSource.map((item) => [item.id, objectIdFromSeed('change-request', item.id)]),
  );
  const documentIdMap = new Map(documentsSource.map((item) => [item.id, objectIdFromSeed('document', item.id)]));
  const notificationIdMap = new Map(
    notificationsSource.map((item) => [item.id, objectIdFromSeed('notification', item.id)]),
  );

  const usedEmails = new Set<string>();
  const usersByKey = new Map<string, Types.ObjectId>();
  const userDocs: Array<Record<string, unknown>> = [];
  const defaultClinicId = clinicsSource[0] ? clinicIdMap.get(clinicsSource[0].id) : undefined;

  const registerUser = (params: {
    key: string;
    id: Types.ObjectId;
    fullName: string;
    email?: string;
    roles: string[];
    clinicId?: Types.ObjectId;
    status?: 'active' | 'invited' | 'disabled';
    passwordHash?: string;
  }): Types.ObjectId => {
    const existing = usersByKey.get(params.key);
    if (existing) {
      return existing;
    }

    const normalizedEmail = params.email?.toLowerCase().trim();
    const email = normalizedEmail && normalizedEmail.length > 0
      ? normalizedEmail
      : buildUniqueEmail(emailLocalPartFromName(params.fullName), usedEmails);
    usedEmails.add(email);

    usersByKey.set(params.key, params.id);
    userDocs.push({
      _id: params.id,
      tenantId: fixedTenantId,
      fullName: params.fullName,
      email,
      roles: params.roles,
      clinicId: params.clinicId,
      status: params.status ?? 'active',
      tokenVersion: 0,
      ...(params.passwordHash ? { passwordHash: params.passwordHash } : {}),
    });
    return params.id;
  };

  registerUser({
    key: 'dev-admin',
    id: fixedAdminUserId,
    fullName: 'Platform Admin',
    email: 'dev-admin@example.test',
    roles: ['admin'],
    status: 'active',
    passwordHash: defaultPasswordHash,
    ...(defaultClinicId ? { clinicId: defaultClinicId } : {}),
  });
  registerUser({
    key: 'platform-admin-alias',
    id: fixedPlatformAdminAliasId,
    fullName: 'Platform Admin',
    email: 'def.admin@export.test',
    roles: ['admin'],
    status: 'active',
    passwordHash: defaultPasswordHash,
    ...(defaultClinicId ? { clinicId: defaultClinicId } : {}),
  });
  registerUser({
    key: 'dev-tech',
    id: fixedTechnicianUserId,
    fullName: 'Lab Technician (DEV ONLY)',
    email: 'dev-tech@example.test',
    roles: ['technician'],
    status: 'active',
    passwordHash: defaultPasswordHash,
    ...(defaultClinicId ? { clinicId: defaultClinicId } : {}),
  });

  const doctorUserByName = new Map<string, Types.ObjectId>();
  for (const doctor of doctorsSource) {
    const clinicId = clinicIdMap.get(doctor.clinicId);
    const doctorUserId = registerUser({
      key: `doctor-user:${doctor.id}`,
      id: objectIdFromSeed('user-doctor', doctor.id),
      fullName: doctor.name,
      email: doctor.email,
      roles: ['doctor'],
      passwordHash: defaultPasswordHash,
      ...(clinicId ? { clinicId } : {}),
    });
    doctorUserByName.set(doctor.name, doctorUserId);
  }

  const technicianUserByName = new Map<string, Types.ObjectId>();
  for (const order of ordersSource) {
    if (!order.technicianName || order.technicianName.trim().length === 0) {
      continue;
    }
    const trimmedName = order.technicianName.trim();
    const clinicId = clinicIdMap.get(order.clinicId);
    const technicianUserId = registerUser({
      key: `technician-user:${trimmedName}`,
      id: objectIdFromSeed('user-technician', trimmedName),
      fullName: trimmedName,
      roles: ['technician'],
      passwordHash: defaultPasswordHash,
      ...(clinicId ? { clinicId } : {}),
    });
    technicianUserByName.set(trimmedName, technicianUserId);
  }

  const requesterUserByName = new Map<string, Types.ObjectId>();
  for (const request of changeRequestsSource) {
    const existing = doctorUserByName.get(request.requester);
    if (existing) {
      requesterUserByName.set(request.requester, existing);
      continue;
    }

    const fallbackUserId = registerUser({
      key: `requester-user:${request.requester}`,
      id: objectIdFromSeed('user-requester', request.requester),
      fullName: request.requester,
      roles: ['staff'],
    });
    requesterUserByName.set(request.requester, fallbackUserId);
  }

  const clinicsDocs = clinicsSource.map((clinic) => ({
    _id: clinicIdMap.get(clinic.id),
    tenantId: fixedTenantId,
    name: clinic.name,
    address: clinic.address,
    city: clinic.city,
    phone: clinic.phone,
    email: clinic.email,
    status: clinic.status,
    accountManager: clinic.accountManager,
  }));

  const doctorsDocs = doctorsSource.map((doctor) => ({
    _id: doctorIdMap.get(doctor.id),
    tenantId: fixedTenantId,
    lookupId: doctor.lookupId,
    name: doctor.name,
    specialty: doctor.specialty,
    clinicId: clinicIdMap.get(doctor.clinicId),
    email: doctor.email,
    phone: doctor.phone,
    status: doctor.status,
    joinedDate: requiredDate(doctor.joinedDate, `doctor.joinedDate (${doctor.id})`),
    avatar: doctor.avatar ?? '',
  }));

  const patientsDocs = patientsSource.map((patient) => ({
    _id: patientIdMap.get(patient.id),
    tenantId: fixedTenantId,
    name: patient.name,
    dob: requiredDate(patient.dob, `patient.dob (${patient.id})`),
    gender: patient.gender,
    phone: patient.phone,
    email: patient.email,
    clinicId: clinicIdMap.get(patient.clinicId),
    doctorId: doctorIdMap.get(patient.doctorId),
    status: patient.status,
    lastVisit: requiredDate(patient.lastVisit, `patient.lastVisit (${patient.id})`),
  }));

  const ordersDocs = ordersSource.map((order) => ({
    _id: orderIdMap.get(order.id),
    tenantId: fixedTenantId,
    orderNumber: order.orderNumber,
    patientId: patientIdMap.get(order.patientId),
    doctorId: doctorIdMap.get(order.doctorId),
    clinicId: clinicIdMap.get(order.clinicId),
    scanCenterId: order.scanCenterId ?? undefined,
    status: order.status,
    priority: order.priority,
    restoration: order.restoration,
    arch: order.arch,
    format: order.format,
    shade: order.shade,
    units: order.units,
    amount: order.amount,
    billed: order.billed,
    billedAmount: order.billed ? order.amount : undefined,
    billTo: order.billTo,
    vouchers: order.vouchers ?? 0,
    isLocked: order.isLocked,
    hasNotes: order.hasNotes,
    notes: order.notes ?? '',
    archiveDate: optionalDate(order.archiveDate),
    receivedAt: requiredDate(order.receivedAt, `order.receivedAt (${order.id})`),
    sentAt: optionalDate(order.sentAt),
    chargedAt: optionalDate(order.chargedAt),
    dueDate: requiredDate(order.dueDate, `order.dueDate (${order.id})`),
    csTask: order.csTask ?? undefined,
    technicianId: order.technicianName
      ? technicianUserByName.get(order.technicianName.trim())
      : undefined,
  }));

  const subOrdersDocs = subOrdersSource.map((subOrder) => ({
    _id: subOrderIdMap.get(subOrder.id),
    tenantId: fixedTenantId,
    orderId: orderIdMap.get(subOrder.orderId),
    service: subOrder.service,
    icon: subOrder.icon ?? '',
    status: subOrder.status,
    formsComplete: subOrder.formsComplete,
    formsTotal: subOrder.formsTotal,
    scansComplete: subOrder.scansComplete,
    scansTotal: subOrder.scansTotal,
    teeth: subOrder.teeth ?? [],
    priority: subOrder.priority,
    dueDate: requiredDate(subOrder.dueDate, `subOrder.dueDate (${subOrder.id})`),
    notes: subOrder.notes ?? '',
  }));

  const casesDocs = casesSource.map((entry) => ({
    _id: caseIdMap.get(entry.id),
    tenantId: fixedTenantId,
    caseNumber: entry.caseNumber,
    title: entry.title,
    patientId: patientIdMap.get(entry.patientId),
    doctorId: doctorIdMap.get(entry.doctorId),
    clinicId: clinicIdMap.get(entry.clinicId),
    status: entry.status,
    priority: entry.priority,
    ordersCount: entry.ordersCount,
    filesCount: entry.filesCount,
    notes: entry.notes ?? '',
    createdAt: optionalDate(entry.createdAt),
    updatedAt: optionalDate(entry.updatedAt),
  }));

  const billingDocs = billingSource
    .map((record) => {
      const orderDocId = orderIdMap.get(record.orderId);
      const sourceOrder = ordersSource.find((order) => order.id === record.orderId);
      if (!orderDocId || !sourceOrder) {
        return null;
      }
      const normalizedInvoiceNumber = record.invoiceNumber && record.invoiceNumber.trim().length > 0
        ? record.invoiceNumber.trim()
        : `INV-AUTO-${record.orderId.toUpperCase()}`;

      return {
        _id: billingIdMap.get(record.id),
        tenantId: fixedTenantId,
        orderId: orderDocId,
        patientId: patientIdMap.get(sourceOrder.patientId),
        doctorId: doctorIdMap.get(sourceOrder.doctorId),
        clinicId: clinicIdMap.get(sourceOrder.clinicId),
        amount: record.amount,
        status: record.status,
        invoiceNumber: normalizedInvoiceNumber,
        ...(optionalDate(record.invoiceDate) ? { invoiceDate: optionalDate(record.invoiceDate) } : {}),
        dueDate: requiredDate(record.dueDate, `billing.dueDate (${record.id})`),
        ...(optionalDate(record.paidDate) ? { paidDate: optionalDate(record.paidDate) } : {}),
        vouchers: record.vouchers ?? 0,
        notes: record.notes ?? '',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const changeRequestsDocs = changeRequestsSource
    .map((request) => {
      const orderDocId = orderIdMap.get(request.orderId);
      const requesterId = requesterUserByName.get(request.requester);
      if (!orderDocId || !requesterId) {
        return null;
      }

      return {
        _id: changeRequestIdMap.get(request.id),
        tenantId: fixedTenantId,
        requestNumber: request.requestNumber,
        orderId: orderDocId,
        requesterId,
        status: request.status,
        priority: request.priority,
        description: request.description,
        createdAt: optionalDate(request.createdAt),
        updatedAt: optionalDate(request.updatedAt),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const doctorIdByName = new Map(doctorsSource.map((doctor) => [doctor.name, doctorIdMap.get(doctor.id)]));
  const documentsDocs = documentsSource.map((document) => ({
    _id: documentIdMap.get(document.id),
    tenantId: fixedTenantId,
    name: document.name,
    category: document.category,
    type: document.type,
    sizeBytes: sizeToBytes(document.size),
    date: requiredDate(document.date, `document.date (${document.id})`),
    doctorId: document.doctor ? doctorIdByName.get(document.doctor) : undefined,
    uploadedBy: fixedTechnicianUserId,
  }));

  const notificationsDocs = notificationsSource.map((notification) => ({
    _id: notificationIdMap.get(notification.id),
    tenantId: fixedTenantId,
    recipientId: fixedAdminUserId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    read: notification.read,
    relatedId: notification.relatedId ? orderIdMap.get(notification.relatedId) : undefined,
    relatedType: notification.relatedType,
    createdAt: optionalDate(notification.createdAt),
  }));


  await Promise.all([
    notifications.deleteMany({ tenantId: fixedTenantId }),
    documents.deleteMany({ tenantId: fixedTenantId }),
    changeRequests.deleteMany({ tenantId: fixedTenantId }),
    billingRecords.deleteMany({ tenantId: fixedTenantId }),
    cases.deleteMany({ tenantId: fixedTenantId }),
    subOrders.deleteMany({ tenantId: fixedTenantId }),
    orders.deleteMany({ tenantId: fixedTenantId }),
    patients.deleteMany({ tenantId: fixedTenantId }),
    doctors.deleteMany({ tenantId: fixedTenantId }),
    clinics.deleteMany({ tenantId: fixedTenantId }),
    users.deleteMany({ tenantId: fixedTenantId }),
  ]);

  await Promise.all([
    users.insertMany(userDocs),
    clinics.insertMany(clinicsDocs),
    doctors.insertMany(doctorsDocs),
    patients.insertMany(patientsDocs),
    orders.insertMany(ordersDocs),
    subOrders.insertMany(subOrdersDocs),
    cases.insertMany(casesDocs),
    billingRecords.insertMany(billingDocs),
    changeRequests.insertMany(changeRequestsDocs),
    documents.insertMany(documentsDocs),
    notifications.insertMany(notificationsDocs),
  ]);

  logger.info(
    {
      imported: {
        users: userDocs.length,
        clinics: clinicsDocs.length,
        doctors: doctorsDocs.length,
        patients: patientsDocs.length,
        orders: ordersDocs.length,
        subOrders: subOrdersDocs.length,
        cases: casesDocs.length,
        billingRecords: billingDocs.length,
        changeRequests: changeRequestsDocs.length,
        documents: documentsDocs.length,
        notifications: notificationsDocs.length,
        scanCenters: scanCentersSource.length,
      },
    },
    'Development seed completed from Angular data files',
  );
};

void seedDevelopmentData()
  .catch((error: unknown) => {
    logger.error({ err: error }, 'Development seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
      await mongoose.disconnect();
      logger.info('MongoDB connection closed after seeding');
    }
  });
