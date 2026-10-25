import type { Types } from "mongoose";

export interface DataVisibilityScope {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  doctorId?: Types.ObjectId;
  clinicId?: Types.ObjectId;
  roles?: string[];
  isAdmin: boolean;
  isDoctor?: boolean;
  isTechnician?: boolean;
  isStaff?: boolean;
  isManager?: boolean;
}
