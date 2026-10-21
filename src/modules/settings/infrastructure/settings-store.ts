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
      id: 'scan-center-1',
      name: 'Cairo Digital Scanning',
      location: 'Cairo Lab Campus',
      operator: 'Karim Fathy',
      devices: 6,
      activeOrders: 8,
      completedToday: 14,
      status: 'Operational',
    },
    {
      id: 'scan-center-2',
      name: 'Nile 3D Imaging',
      location: 'Giza Production Hub',
      operator: 'Salma Adel',
      devices: 4,
      activeOrders: 5,
      completedToday: 9,
      status: 'Operational',
    },
    {
      id: 'scan-center-3',
      name: 'Delta Scan Center',
      location: 'Mansoura Clinic Network',
      operator: 'Hassan Mahmoud',
      devices: 3,
      activeOrders: 3,
      completedToday: 6,
      status: 'Maintenance',
    },
  ],
  quarterlyTargets: [],
  teamMembers: [],
};

export class InMemorySettingsStore {
  public getSnapshot(): SettingsSnapshot {
    return settingsSnapshot;
  }
}
