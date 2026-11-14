import { normalizeArabic } from '../../../shared/application/text/arabic-normalize';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export type AssistantLookupKind = 'patients' | 'doctors' | 'clinics' | 'services' | 'orders';

export interface AssistantLookupItem {
  id: string;
  label: string;
  sublabel: string;
}

interface LookupRecord {
  id: string;
  name?: string;
  orderNumber?: string;
  phone?: string;
  specialty?: string;
  city?: string;
  description?: string;
}

interface AssistantLookupDependencies {
  patients: (scope: DataVisibilityScope, clinicId?: string) => Promise<LookupRecord[]>;
  doctors?: (scope: DataVisibilityScope, clinicId?: string) => Promise<LookupRecord[]>;
  clinics?: (scope: DataVisibilityScope) => Promise<LookupRecord[]>;
  services?: (scope: DataVisibilityScope) => Promise<LookupRecord[]>;
  orders?: (scope: DataVisibilityScope, clinicId?: string) => Promise<LookupRecord[]>;
}

export class AssistantLookupService {
  public constructor(private readonly dependencies: AssistantLookupDependencies) {}

  public async lookup(input: {
    kind: AssistantLookupKind;
    query: string;
    scope: DataVisibilityScope;
    clinicId?: string;
    limit: number;
  }): Promise<{ items: AssistantLookupItem[] }> {
    const records = await this.recordsFor(input.kind, input.scope, input.clinicId);
    const normalizedQuery = normalizeArabic(input.query);
    const matches = records
      .map((record) => ({ record, value: normalizeArabic(this.labelFor(input.kind, record)) }))
      .filter(({ value }) => value.startsWith(normalizedQuery) || value.includes(normalizedQuery))
      .sort((left, right) => {
        const leftPrefix = left.value.startsWith(normalizedQuery) ? 0 : 1;
        const rightPrefix = right.value.startsWith(normalizedQuery) ? 0 : 1;
        return leftPrefix - rightPrefix;
      })
      .slice(0, Math.min(input.limit, 20))
      .map(({ record }) => ({
        id: record.id,
        label: this.labelFor(input.kind, record),
        sublabel: this.sublabelFor(input.kind, record),
      }));

    return { items: matches };
  }

  private async recordsFor(
    kind: AssistantLookupKind,
    scope: DataVisibilityScope,
    clinicId?: string,
  ): Promise<LookupRecord[]> {
    const loader = this.dependencies[kind];
    if (!loader) return [];
    return loader(scope, clinicId);
  }

  private labelFor(kind: AssistantLookupKind, record: LookupRecord): string {
    return kind === 'orders' ? record.orderNumber ?? record.id : record.name ?? record.id;
  }

  private sublabelFor(kind: AssistantLookupKind, record: LookupRecord): string {
    if (kind === 'patients') return record.phone ?? '';
    if (kind === 'doctors') return record.specialty ?? '';
    if (kind === 'clinics') return record.city ?? '';
    return record.description ?? '';
  }
}
