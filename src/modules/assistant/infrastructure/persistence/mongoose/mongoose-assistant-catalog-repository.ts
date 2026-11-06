import { Types } from 'mongoose';

import {
  type AssistantCatalogRepository,
  type AssistantCompanyProfileRecord,
  type AssistantServiceRecord,
} from '../../../application/assistant-catalog';
import { AssistantCompanyProfileModel } from './assistant-company-profile.model';
import { AssistantServiceCatalogModel } from './assistant-service-catalog.model';

export class MongooseAssistantCatalogRepository implements AssistantCatalogRepository {
  public async listServices(tenantId: string): Promise<AssistantServiceRecord[]> {
    const rows = await AssistantServiceCatalogModel.find({
      tenantId: new Types.ObjectId(tenantId),
      isActive: true,
    })
      .sort({ sortOrder: 1, name: 1 })
      .lean()
      .exec();

    return rows.map((row) => ({
      serviceId: row.serviceId,
      name: row.name,
      description: row.description ?? '',
      basePrice: row.basePrice,
      turnaroundDays: row.turnaroundDays,
      scanRequirements: [...(row.scanRequirements ?? [])],
    }));
  }

  public async getCompanyProfile(tenantId: string): Promise<AssistantCompanyProfileRecord | null> {
    const row = await AssistantCompanyProfileModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    })
      .lean()
      .exec();

    if (!row) {
      return null;
    }

    return {
      name: row.name,
      about: row.about ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      address: row.address ?? '',
      workingHours: row.workingHours ?? '',
      submissionStandards: [...(row.submissionStandards ?? [])],
    };
  }
}
