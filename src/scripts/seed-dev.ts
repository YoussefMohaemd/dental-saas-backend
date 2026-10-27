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
  gender?: 'M' | 'F';
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
  creationData?: {
    serviceId: string;
    serviceDetails: Record<string, string>;
    serviceForm: Record<string, string>;
    selectedTeeth: number[];
    scanRequirements: string[];
    fileReferences: string[];
  };
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
  name?: string;
  location?: string;
  operator?: string;
  devices?: number;
  status?: 'Operational' | 'Maintenance';
}

const toObjectId = (value: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(value);
const fixedTenantId = toObjectId('66f100000000000000000001');
const fixedSecondaryTenantId = toObjectId('66f100000000000000000101');
const fixedAdminUserId = toObjectId('66f100000000000000000005');
const fixedTechnicianUserId = toObjectId('66f100000000000000000006');
const fixedPlatformAdminAliasId = toObjectId('66f100000000000000000007');
const fixedStaffUserId = toObjectId('66f100000000000000000008');
const fixedManagerUserId = toObjectId('66f100000000000000000009');
const fixedSecondaryAdminUserId = toObjectId('66f100000000000000000105');
const fixedSecondaryDoctorUserId = toObjectId('66f100000000000000000106');

const passwordHasher = new PasswordHasher();

const defaultScanCenterDetails: Record<
  string,
  Omit<Required<ScanCenterSeed>, 'id'>
> = {
  'scan-center-1': {
    name: 'Cairo Digital Scanning',
    location: 'Cairo Lab Campus',
    operator: 'Karim Fathy',
    devices: 6,
    status: 'Operational',
  },
  'scan-center-2': {
    name: 'Nile 3D Imaging',
    location: 'Giza Production Hub',
    operator: 'Salma Adel',
    devices: 4,
    status: 'Operational',
  },
  'scan-center-3': {
    name: 'Delta Scan Center',
    location: 'Mansoura Clinic Network',
    operator: 'Hassan Mahmoud',
    devices: 3,
    status: 'Maintenance',
  },
};

const seedDataDirectory = resolve(__dirname, '..', '..', 'seed-data');

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
    unit === 'GB' ? 1024 * 1024 * 1024 : unit === 'MB' ? 1024 * 1024 : unit === 'KB' ? 1024 : 1;

  return Math.round(amount * multiplier);
}

function emailLocalPartFromName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 48) || 'user'
  );
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
    scanCenters,
  } = registerPersistenceModels();

  const defaultPasswordHash = await passwordHasher.hash('ChangeMe123!');

  await mongoose.connect(env.MONGODB_URI);
  logger.info('Connected to MongoDB for development seeding (Angular data import)');

  const clinicIdMap = new Map(
    clinicsSource.map((item) => [item.id, objectIdFromSeed('clinic', item.id)]),
  );
  const doctorIdMap = new Map(
    doctorsSource.map((item) => [item.id, objectIdFromSeed('doctor', item.id)]),
  );
  const patientIdMap = new Map(
    patientsSource.map((item) => [item.id, objectIdFromSeed('patient', item.id)]),
  );
  const orderIdMap = new Map(
    ordersSource.map((item) => [item.id, objectIdFromSeed('order', item.id)]),
  );
  const subOrderIdMap = new Map(
    subOrdersSource.map((item) => [item.id, objectIdFromSeed('sub-order', item.id)]),
  );
  const caseIdMap = new Map(
    casesSource.map((item) => [item.id, objectIdFromSeed('case', item.id)]),
  );
  const billingIdMap = new Map(
    billingSource.map((item) => [item.id, objectIdFromSeed('billing', item.id)]),
  );
  const changeRequestIdMap = new Map(
    changeRequestsSource.map((item) => [item.id, objectIdFromSeed('change-request', item.id)]),
  );
  const documentIdMap = new Map(
    documentsSource.map((item) => [item.id, objectIdFromSeed('document', item.id)]),
  );
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
    const email =
      normalizedEmail && normalizedEmail.length > 0
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
  registerUser({
    key: 'dev-staff',
    id: fixedStaffUserId,
    fullName: 'Operations Staff',
    email: 'dev-staff@example.test',
    roles: ['staff'],
    status: 'active',
    passwordHash: defaultPasswordHash,
    ...(defaultClinicId ? { clinicId: defaultClinicId } : {}),
  });
  registerUser({
    key: 'dev-manager',
    id: fixedManagerUserId,
    fullName: 'Lab Manager',
    email: 'dev-manager@example.test',
    roles: ['manager'],
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
    ...(subOrder.creationData !== undefined ? { creationData: subOrder.creationData } : {}),
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
      const normalizedInvoiceNumber =
        record.invoiceNumber && record.invoiceNumber.trim().length > 0
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
        ...(optionalDate(record.invoiceDate)
          ? { invoiceDate: optionalDate(record.invoiceDate) }
          : {}),
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

  const doctorIdByName = new Map(
    doctorsSource.map((doctor) => [doctor.name, doctorIdMap.get(doctor.id)]),
  );
  const subOrderByOrderId = new Map(
    subOrdersSource.map((subOrder) => [subOrder.orderId, subOrderIdMap.get(subOrder.id)]),
  );
  const uploaders = [
    fixedAdminUserId,
    fixedTechnicianUserId,
    fixedStaffUserId,
    fixedManagerUserId,
    ...doctorUserByName.values(),
    ...technicianUserByName.values(),
  ];
  const notificationRecipients = uploaders;

  const documentsDocs = documentsSource.map((document, index) => {
    const sourceOrder = ordersSource.length > 0
      ? ordersSource[index % ordersSource.length]
      : undefined;
    const uploaderId = uploaders[index % uploaders.length] ?? fixedAdminUserId;

    return {
      _id: documentIdMap.get(document.id),
      tenantId: fixedTenantId,
      name: document.name,
      category: document.category,
      type: document.type,
      sizeBytes: sizeToBytes(document.size),
      date: requiredDate(document.date, `document.date (${document.id})`),
      doctorId: document.doctor
        ? doctorIdByName.get(document.doctor)
        : sourceOrder
          ? doctorIdMap.get(sourceOrder.doctorId)
          : undefined,
      patientId: sourceOrder ? patientIdMap.get(sourceOrder.patientId) : undefined,
      clinicId: sourceOrder ? clinicIdMap.get(sourceOrder.clinicId) : undefined,
      orderId: sourceOrder ? orderIdMap.get(sourceOrder.id) : undefined,
      subOrderId: sourceOrder ? subOrderByOrderId.get(sourceOrder.id) : undefined,
      uploadedBy: uploaderId,
    };
  });

  const notificationsDocs = notificationsSource.map((notification, index) => {
    const recipientId =
      notificationRecipients[index % notificationRecipients.length] ??
      fixedAdminUserId;

    return {
      _id: notificationIdMap.get(notification.id),
      tenantId: fixedTenantId,
      recipientId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      read: notification.read,
      relatedId: notification.relatedId ? orderIdMap.get(notification.relatedId) : undefined,
      relatedType: notification.relatedType,
      createdAt: optionalDate(notification.createdAt),
    };
  });

  const scanCentersDocs = scanCentersSource.map((scanCenter) => {
    const defaults = defaultScanCenterDetails[scanCenter.id] ?? {
      name: scanCenter.id,
      location: 'Unassigned',
      operator: 'Unassigned',
      devices: 0,
      status: 'Maintenance' as const,
    };

    return {
      tenantId: fixedTenantId,
      externalId: scanCenter.id,
      name: scanCenter.name ?? defaults.name,
      location: scanCenter.location ?? defaults.location,
      operator: scanCenter.operator ?? defaults.operator,
      devices: scanCenter.devices ?? defaults.devices,
      status: scanCenter.status ?? defaults.status,
    };
  });

  const fallbackOrder = ordersSource[0];
  const fallbackCase = casesSource[0];
  const fallbackSubOrder = subOrdersSource[0];
  const fallbackBilling = billingSource[0];
  const fallbackChangeRequest = changeRequestsSource[0];
  const fallbackDocument = documentsSource[0];
  const fallbackNotification = notificationsSource[0];

  const secondaryClinicId = objectIdFromSeed('tenant-2-clinic', 'clinic-1');
  const secondaryDoctorId = objectIdFromSeed('tenant-2-doctor', 'doctor-1');
  const secondaryPatientId = objectIdFromSeed('tenant-2-patient', 'patient-1');
  const secondaryOrderId = objectIdFromSeed('tenant-2-order', 'order-1');
  const secondarySubOrderId = objectIdFromSeed('tenant-2-sub-order', 'sub-order-1');
  const secondaryCaseId = objectIdFromSeed('tenant-2-case', 'case-1');
  const secondaryBillingId = objectIdFromSeed('tenant-2-billing', 'billing-1');
  const secondaryChangeRequestId = objectIdFromSeed('tenant-2-change-request', 'change-request-1');
  const secondaryDocumentId = objectIdFromSeed('tenant-2-document', 'document-1');
  const secondaryNotificationId = objectIdFromSeed('tenant-2-notification', 'notification-1');
  const secondaryScanCenterExternalId = 'scan-center-tenant-2-1';

  const secondaryTenantUsersDocs: Array<Record<string, unknown>> = [
    {
      _id: fixedSecondaryAdminUserId,
      tenantId: fixedSecondaryTenantId,
      fullName: 'Tenant 2 Admin',
      email: 'dev-admin-tenant2@example.test',
      roles: ['admin'],
      clinicId: secondaryClinicId,
      status: 'active',
      tokenVersion: 0,
      passwordHash: defaultPasswordHash,
    },
    {
      _id: fixedSecondaryDoctorUserId,
      tenantId: fixedSecondaryTenantId,
      fullName: 'Tenant 2 Doctor',
      email: 'dev-doctor-tenant2@example.test',
      roles: ['doctor'],
      clinicId: secondaryClinicId,
      status: 'active',
      tokenVersion: 0,
      passwordHash: defaultPasswordHash,
    },
  ];

  const secondaryTenantClinicsDocs: Array<Record<string, unknown>> = [
    {
      _id: secondaryClinicId,
      tenantId: fixedSecondaryTenantId,
      name: 'North Delta Dental Clinic',
      address: '12 Tenant Two Street',
      city: 'Alexandria',
      phone: '+20 10 7000 0001',
      email: 'tenant2-clinic@example.test',
      status: 'Active',
      accountManager: 'Tenant 2 Manager',
    },
  ];

  const secondaryTenantDoctorsDocs: Array<Record<string, unknown>> = [
    {
      _id: secondaryDoctorId,
      tenantId: fixedSecondaryTenantId,
      lookupId: 'T2-DR-001',
      name: 'Tenant 2 Doctor',
      specialty: 'Prosthodontics',
      clinicId: secondaryClinicId,
      email: 'dev-doctor-tenant2@example.test',
      phone: '+20 11 7000 0001',
      status: 'Active',
      joinedDate: requiredDate('2025-01-10', 'tenant2.doctor.joinedDate'),
      avatar: '',
    },
  ];

  const secondaryTenantPatientsDocs: Array<Record<string, unknown>> = [
    {
      _id: secondaryPatientId,
      tenantId: fixedSecondaryTenantId,
      name: 'Tenant 2 Patient',
      dob: requiredDate('1993-03-15', 'tenant2.patient.dob'),
      gender: 'F',
      phone: '+20 12 7000 0001',
      email: 'tenant2-patient@example.test',
      clinicId: secondaryClinicId,
      doctorId: secondaryDoctorId,
      status: 'Active',
      lastVisit: requiredDate('2026-09-20', 'tenant2.patient.lastVisit'),
    },
  ];

  const secondaryTenantOrdersDocs: Array<Record<string, unknown>> = [
    {
      _id: secondaryOrderId,
      tenantId: fixedSecondaryTenantId,
      orderNumber: 'T2-DL-000001',
      patientId: secondaryPatientId,
      doctorId: secondaryDoctorId,
      clinicId: secondaryClinicId,
      scanCenterId: secondaryScanCenterExternalId,
      status: fallbackOrder?.status ?? 'New',
      priority: fallbackOrder?.priority ?? 'Normal',
      restoration: fallbackOrder?.restoration ?? 'Crown',
      arch: fallbackOrder?.arch ?? 'Maxilla',
      format: fallbackOrder?.format ?? 'STL',
      shade: fallbackOrder?.shade ?? 'A2',
      units: 2,
      amount: 820,
      billed: false,
      billTo: 'Doctor',
      vouchers: 0,
      isLocked: false,
      hasNotes: true,
      notes: 'Seeded tenant-2 order for tenant isolation verification',
      receivedAt: requiredDate('2026-10-10T10:00:00.000Z', 'tenant2.order.receivedAt'),
      dueDate: requiredDate('2026-10-20T10:00:00.000Z', 'tenant2.order.dueDate'),
      csTask: fallbackOrder?.csTask ?? undefined,
      technicianId: undefined,
    },
  ];

  const secondaryTenantSubOrdersDocs: Array<Record<string, unknown>> = [
    {
      _id: secondarySubOrderId,
      tenantId: fixedSecondaryTenantId,
      orderId: secondaryOrderId,
      service: fallbackSubOrder?.service ?? 'Digital Design',
      icon: fallbackSubOrder?.icon ?? '',
      status: fallbackSubOrder?.status ?? 'pending',
      formsComplete: 1,
      formsTotal: 2,
      scansComplete: 1,
      scansTotal: 1,
      teeth: fallbackSubOrder?.teeth ?? [11, 12],
      priority: fallbackSubOrder?.priority ?? 'Normal',
      dueDate: requiredDate('2026-10-18T10:00:00.000Z', 'tenant2.subOrder.dueDate'),
      notes: 'Tenant-2 seeded sub-order',
    },
  ];

  const secondaryTenantCasesDocs: Array<Record<string, unknown>> = [
    {
      _id: secondaryCaseId,
      tenantId: fixedSecondaryTenantId,
      caseNumber: 'T2-CASE-001',
      title: 'Tenant 2 Crown Case',
      patientId: secondaryPatientId,
      doctorId: secondaryDoctorId,
      clinicId: secondaryClinicId,
      status: fallbackCase?.status ?? 'Open',
      priority: fallbackCase?.priority ?? 'Normal',
      ordersCount: 1,
      filesCount: 1,
      notes: 'Tenant-2 seeded case',
      createdAt: optionalDate('2026-10-10T10:00:00.000Z'),
      updatedAt: optionalDate('2026-10-12T10:00:00.000Z'),
    },
  ];

  const secondaryTenantBillingDocs: Array<Record<string, unknown>> = [
    {
      _id: secondaryBillingId,
      tenantId: fixedSecondaryTenantId,
      orderId: secondaryOrderId,
      patientId: secondaryPatientId,
      doctorId: secondaryDoctorId,
      clinicId: secondaryClinicId,
      amount: 820,
      status: fallbackBilling?.status ?? 'Pending',
      invoiceNumber: 'T2-INV-0001',
      dueDate: requiredDate('2026-11-01T00:00:00.000Z', 'tenant2.billing.dueDate'),
      vouchers: 0,
      notes: 'Tenant-2 seeded billing record',
    },
  ];

  const secondaryTenantChangeRequestsDocs: Array<Record<string, unknown>> = [
    {
      _id: secondaryChangeRequestId,
      tenantId: fixedSecondaryTenantId,
      requestNumber: 'T2-CR-0001',
      orderId: secondaryOrderId,
      requesterId: fixedSecondaryDoctorUserId,
      status: fallbackChangeRequest?.status ?? 'Pending',
      priority: fallbackChangeRequest?.priority ?? 'High',
      description: 'Adjust proximal contact and occlusal anatomy.',
      createdAt: optionalDate('2026-10-11T10:00:00.000Z'),
      updatedAt: optionalDate('2026-10-11T10:00:00.000Z'),
    },
  ];

  const secondaryTenantDocumentsDocs: Array<Record<string, unknown>> = [
    {
      _id: secondaryDocumentId,
      tenantId: fixedSecondaryTenantId,
      name: 'Tenant-2-Design-Notes.pdf',
      category: fallbackDocument?.category ?? 'Prescription',
      type: fallbackDocument?.type ?? 'PDF',
      sizeBytes: 153600,
      date: requiredDate('2026-10-11T10:00:00.000Z', 'tenant2.document.date'),
      doctorId: secondaryDoctorId,
      patientId: secondaryPatientId,
      clinicId: secondaryClinicId,
      orderId: secondaryOrderId,
      subOrderId: secondarySubOrderId,
      uploadedBy: fixedSecondaryAdminUserId,
    },
  ];

  const secondaryTenantNotificationsDocs: Array<Record<string, unknown>> = [
    {
      _id: secondaryNotificationId,
      tenantId: fixedSecondaryTenantId,
      recipientId: fixedSecondaryAdminUserId,
      type: fallbackNotification?.type ?? 'System',
      title: 'Tenant 2 change request received',
      message: 'A new change request was submitted for order T2-DL-000001.',
      read: false,
      relatedId: secondaryOrderId,
      relatedType: 'order',
      createdAt: optionalDate('2026-10-11T10:05:00.000Z'),
    },
  ];

  const secondaryTenantScanCentersDocs: Array<Record<string, unknown>> = [
    {
      tenantId: fixedSecondaryTenantId,
      externalId: secondaryScanCenterExternalId,
      name: 'Tenant 2 Digital Scan Center',
      location: 'Alexandria North Hub',
      operator: 'Tenant 2 Operator',
      devices: 2,
      status: 'Operational',
    },
  ];

  await Promise.all([
    notifications.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    documents.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    changeRequests.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    billingRecords.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    cases.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    subOrders.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    orders.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    patients.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    doctors.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    clinics.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    scanCenters.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
    users.deleteMany({ tenantId: { $in: [fixedTenantId, fixedSecondaryTenantId] } }),
  ]);

  await Promise.all([
    users.insertMany([...userDocs, ...secondaryTenantUsersDocs]),
    clinics.insertMany([...clinicsDocs, ...secondaryTenantClinicsDocs]),
    doctors.insertMany([...doctorsDocs, ...secondaryTenantDoctorsDocs]),
    patients.insertMany([...patientsDocs, ...secondaryTenantPatientsDocs]),
    orders.insertMany([...ordersDocs, ...secondaryTenantOrdersDocs]),
    subOrders.insertMany([...subOrdersDocs, ...secondaryTenantSubOrdersDocs]),
    cases.insertMany([...casesDocs, ...secondaryTenantCasesDocs]),
    billingRecords.insertMany([...billingDocs, ...secondaryTenantBillingDocs]),
    changeRequests.insertMany([...changeRequestsDocs, ...secondaryTenantChangeRequestsDocs]),
    documents.insertMany([...documentsDocs, ...secondaryTenantDocumentsDocs]),
    notifications.insertMany([...notificationsDocs, ...secondaryTenantNotificationsDocs]),
    scanCenters.insertMany([...scanCentersDocs, ...secondaryTenantScanCentersDocs]),
  ]);

  logger.info(
    {
      imported: {
        users: userDocs.length + secondaryTenantUsersDocs.length,
        clinics: clinicsDocs.length + secondaryTenantClinicsDocs.length,
        doctors: doctorsDocs.length + secondaryTenantDoctorsDocs.length,
        patients: patientsDocs.length + secondaryTenantPatientsDocs.length,
        orders: ordersDocs.length + secondaryTenantOrdersDocs.length,
        subOrders: subOrdersDocs.length + secondaryTenantSubOrdersDocs.length,
        cases: casesDocs.length + secondaryTenantCasesDocs.length,
        billingRecords: billingDocs.length + secondaryTenantBillingDocs.length,
        changeRequests: changeRequestsDocs.length + secondaryTenantChangeRequestsDocs.length,
        documents: documentsDocs.length + secondaryTenantDocumentsDocs.length,
        notifications: notificationsDocs.length + secondaryTenantNotificationsDocs.length,
        scanCenters: scanCentersDocs.length + secondaryTenantScanCentersDocs.length,
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
