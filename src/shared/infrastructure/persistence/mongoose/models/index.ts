import { AuthSessionModel } from './auth-session.model';
import { BillingRecordModel } from './billing-record.model';
import { CaseModel } from './case.model';
import { ChangeRequestModel } from './change-request.model';
import { ClinicModel } from './clinic.model';
import { DoctorModel } from './doctor.model';
import { DocumentModel } from './document.model';
import { NotificationModel } from './notification.model';
import { OrderModel } from './order.model';
import { PatientModel } from './patient.model';
import { ScanCenterModel } from './scan-center.model';
import { SubOrderModel } from './sub-order.model';
import { UserModel } from './user.model';
import { UserPreferencesModel } from './user-preferences.model';

const persistenceModels = {
  users: UserModel,
  authSessions: AuthSessionModel,
  clinics: ClinicModel,
  doctors: DoctorModel,
  patients: PatientModel,
  orders: OrderModel,
  subOrders: SubOrderModel,
  notifications: NotificationModel,
  documents: DocumentModel,
  cases: CaseModel,
  billingRecords: BillingRecordModel,
  changeRequests: ChangeRequestModel,
  scanCenters: ScanCenterModel,
  userPreferences: UserPreferencesModel,
} as const;

export const registerPersistenceModels = () => persistenceModels;

export { persistenceModels };
export {
  AuthSessionModel,
  BillingRecordModel,
  CaseModel,
  ChangeRequestModel,
  ClinicModel,
  DoctorModel,
  DocumentModel,
  NotificationModel,
  OrderModel,
  PatientModel,
  ScanCenterModel,
  SubOrderModel,
  UserModel,
  UserPreferencesModel,
};
