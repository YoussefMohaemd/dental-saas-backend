export interface AssistantServiceRecord {
  serviceId: string;
  name: string;
  description: string;
  basePrice: number;
  turnaroundDays: number;
  scanRequirements: string[];
}

export interface AssistantCompanyProfileRecord {
  name: string;
  about: string;
  email: string;
  phone: string;
  address: string;
  workingHours: string;
  submissionStandards: string[];
}

/**
 * Read-only access to the company profile and service catalog. Everything the
 * assistant says about the company, services and pricing comes from here
 * (MongoDB), never from hardcoded or mock data.
 */
export interface AssistantCatalogRepository {
  listServices(tenantId: string): Promise<AssistantServiceRecord[]>;
  getCompanyProfile(tenantId: string): Promise<AssistantCompanyProfileRecord | null>;
}

export class EmptyAssistantCatalogRepository implements AssistantCatalogRepository {
  public listServices(): Promise<AssistantServiceRecord[]> {
    return Promise.resolve([]);
  }

  public getCompanyProfile(): Promise<AssistantCompanyProfileRecord | null> {
    return Promise.resolve(null);
  }
}
