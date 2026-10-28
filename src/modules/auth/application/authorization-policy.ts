export const DENTAL_CAPABILITIES = [
  'dashboard.read',
  'orders.read',
  'orders.create',
  'orders.update',
  'orders.delete',
  'orders.export',
  'orders.archive',
  'orders.lock',
  'orders.subOrders.update',
  'orders.subOrders.manage',
  'cases.read',
  'cases.create',
  'patients.read',
  'patients.create',
  'patients.update',
  'patients.delete',
  'doctors.read',
  'doctors.manage',
  'clinics.read',
  'clinics.manage',
  'scanCenters.read',
  'documents.read',
  'documents.manage',
  'billing.read',
  'billing.update',
  'changeRequests.read',
  'changeRequests.update',
  'reports.read',
  'notifications.read',
  'settings.read',
  'settings.update',
  'users.read',
  'users.manage',
  'auth.sessions.revoke',
  'forms.read',
  'grid.read',
] as const;

export type DentalCapability = (typeof DENTAL_CAPABILITIES)[number];
type CanonicalRole = 'admin' | 'staff' | 'manager' | 'doctor' | 'technician';

const BASE_CAPABILITIES: readonly DentalCapability[] = [
  'dashboard.read',
  'orders.read',
  'cases.read',
  'patients.read',
  'doctors.read',
  'clinics.read',
  'scanCenters.read',
  'documents.read',
  'billing.read',
  'changeRequests.read',
  'reports.read',
  'notifications.read',
  'settings.read',
  'settings.update',
];

const ROLE_CAPABILITY_MAP: Record<CanonicalRole, readonly DentalCapability[]> = {
  admin: DENTAL_CAPABILITIES,
  staff: [
    ...BASE_CAPABILITIES,
    'orders.create',
    'orders.update',
    'orders.delete',
    'orders.export',
    'orders.archive',
    'orders.lock',
    'orders.subOrders.update',
    'orders.subOrders.manage',
    'cases.create',
    'patients.create',
    'patients.update',
    'patients.delete',
    'doctors.manage',
    'clinics.manage',
    'documents.manage',
    'billing.update',
    'changeRequests.update',
    'users.read',
    'forms.read',
    'grid.read',
  ],
  manager: [
    ...BASE_CAPABILITIES,
    'orders.export',
    'forms.read',
    'grid.read',
  ],
  doctor: [
    ...BASE_CAPABILITIES,
    'orders.create',
    'orders.update',
    'orders.delete',
    'orders.export',
    'orders.archive',
    'orders.lock',
    'orders.subOrders.manage',
    'orders.subOrders.update',
    'cases.create',
    'patients.create',
    'patients.update',
    'documents.manage',
    'changeRequests.update',
    'forms.read',
    'grid.read',
  ],
  technician: [
    ...BASE_CAPABILITIES,
    'orders.export',
    'orders.subOrders.update',
    'cases.create',
    'documents.manage',
    'forms.read',
    'grid.read',
  ],
};

export function resolveRoleCapabilities(roles: readonly string[]): DentalCapability[] {
  const normalizedRoles = normalizeRoles(roles);
  const resolved = new Set<DentalCapability>();

  for (const role of normalizedRoles) {
    const roleCapabilities = ROLE_CAPABILITY_MAP[role];
    if (!roleCapabilities) {
      continue;
    }

    for (const capability of roleCapabilities) {
      resolved.add(capability);
    }
  }

  return [...resolved].sort();
}

function normalizeRoles(roles: readonly string[]): CanonicalRole[] {
  return Array.from(
    new Set(
      roles
        .map((role) => normalizeRoleAlias(role))
        .filter((role): role is CanonicalRole => role !== undefined),
    ),
  );
}

const ROLE_ALIASES: Record<CanonicalRole, ReadonlySet<string>> = {
  admin: new Set(['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'super admin']),
  staff: new Set(['staff']),
  manager: new Set(['manager', 'lab manager', 'lab-manager', 'lab_manager']),
  doctor: new Set(['doctor', 'dentist', 'dental doctor']),
  technician: new Set(['technician', 'tech', 'lab-technician', 'lab_technician', 'lab tech', 'labtech']),
};

function normalizeRoleAlias(role: string): CanonicalRole | undefined {
  const normalized = role.trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, '');

  for (const [canonicalRole, aliases] of Object.entries(ROLE_ALIASES) as Array<
    [CanonicalRole, ReadonlySet<string>]
  >) {
    if (aliases.has(normalized) || aliases.has(compact)) {
      return canonicalRole;
    }
  }

  return undefined;
}
