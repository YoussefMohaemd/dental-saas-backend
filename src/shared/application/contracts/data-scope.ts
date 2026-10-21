import { Types } from "mongoose";

export interface DataVisibilityScope {
  userId: Types.ObjectId;
  doctorId?: Types.ObjectId;
  clinicId?: Types.ObjectId;
  isAdmin: boolean;
}
