import { type ReportEmployeeStatus, type ScanCenterStatus } from '../../../shared/application/contracts/dental-api-contract';

export interface ScanCenterSetting {
  id: string;
  name: string;
  location: string;
  operator: string;
  devices: number;
  activeOrders: number;
  completedToday: number;
  status: ScanCenterStatus;
}

export interface QuarterlyTargetSetting {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  targetRevenue: number;
  achievedRevenue: number;
  ordersTarget: number;
  ordersCompleted: number;
}

export interface TeamMemberSetting {
  userId: number;
  type: string;
  fullName: string;
  status: ReportEmployeeStatus;
}

export interface SettingsSnapshot {
  scanCenters: ScanCenterSetting[];
  quarterlyTargets: QuarterlyTargetSetting[];
  teamMembers: TeamMemberSetting[];
}

const settingsSnapshot: SettingsSnapshot = {
  scanCenters: [
    {
      id: 'sc1',
      name: 'SC-LA Central',
      location: 'Los Angeles, CA',
      operator: 'Marcus Lee',
      devices: 3,
      activeOrders: 12,
      completedToday: 8,
      status: 'Operational',
    },
    {
      id: 'sc2',
      name: 'SC-SD Harbor',
      location: 'San Diego, CA',
      operator: 'Sofia Reyes',
      devices: 2,
      activeOrders: 7,
      completedToday: 5,
      status: 'Operational',
    },
    {
      id: 'sc3',
      name: 'SC-SF Bay',
      location: 'San Francisco, CA',
      operator: 'Daniel Park',
      devices: 4,
      activeOrders: 15,
      completedToday: 11,
      status: 'Operational',
    },
    {
      id: 'sc4',
      name: 'SC-SAC Valley',
      location: 'Sacramento, CA',
      operator: 'Nadia Morin',
      devices: 2,
      activeOrders: 4,
      completedToday: 3,
      status: 'Maintenance',
    },
    {
      id: 'sc5',
      name: 'SC-SB Coast',
      location: 'Santa Barbara, CA',
      operator: 'Tom Bradley',
      devices: 1,
      activeOrders: 2,
      completedToday: 2,
      status: 'Operational',
    },
  ],
  quarterlyTargets: [
    { year: 2026, quarter: 1, targetRevenue: 310_000, achievedRevenue: 294_500, ordersTarget: 480, ordersCompleted: 452 },
    { year: 2026, quarter: 2, targetRevenue: 325_000, achievedRevenue: 318_400, ordersTarget: 510, ordersCompleted: 498 },
    { year: 2026, quarter: 3, targetRevenue: 340_000, achievedRevenue: 332_100, ordersTarget: 540, ordersCompleted: 529 },
    { year: 2026, quarter: 4, targetRevenue: 360_000, achievedRevenue: 348_000, ordersTarget: 575, ordersCompleted: 551 },
  ],
  teamMembers: [
    { userId: 1, type: 'Technician', fullName: 'Ava Thompson', status: 'Active' },
    { userId: 2, type: 'Technician', fullName: 'Noah Martinez', status: 'Active' },
    { userId: 3, type: 'Designer', fullName: 'Mia Lewis', status: 'Active' },
    { userId: 4, type: 'QC Specialist', fullName: 'Liam Clark', status: 'On Leave' },
    { userId: 5, type: 'Support', fullName: 'Sophia Hall', status: 'Active' },
  ],
};

export class InMemorySettingsStore {
  public getSnapshot(): SettingsSnapshot {
    return settingsSnapshot;
  }
}
