import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';

export interface SttVocabularyEntity {
  id: string;
  label: string;
}

export interface SttVocabularySnapshot {
  terms: string[];
  doctors: SttVocabularyEntity[];
  clinics: SttVocabularyEntity[];
  services: SttVocabularyEntity[];
  patients: SttVocabularyEntity[];
}

interface SttVocabularyServiceDependencies {
  loadDoctors: (scope: DataVisibilityScope) => Promise<SttVocabularyEntity[]>;
  loadClinics: (scope: DataVisibilityScope) => Promise<SttVocabularyEntity[]>;
  loadServices: (scope: DataVisibilityScope) => Promise<SttVocabularyEntity[]>;
  loadPatients: (scope: DataVisibilityScope) => Promise<SttVocabularyEntity[]>;
  now?: () => number;
  cacheTtlMs?: number;
}

interface CachedVocabulary {
  expiresAtMs: number;
  snapshot: SttVocabularySnapshot;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DENTAL_BASE_TERMS = [
  'crown',
  'bridge',
  'implant',
  'تقويم',
  'حشو',
  'خلع',
  'تبييض',
];

export class SttVocabularyService {
  private readonly cache = new Map<string, CachedVocabulary>();
  private readonly now: () => number;
  private readonly cacheTtlMs: number;

  public constructor(private readonly dependencies: SttVocabularyServiceDependencies) {
    this.now = dependencies.now ?? Date.now;
    this.cacheTtlMs = dependencies.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  public async getVocabulary(input: { scope: DataVisibilityScope }): Promise<SttVocabularySnapshot> {
    const tenantId = input.scope.tenantId.toHexString();
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAtMs > this.now()) {
      return cached.snapshot;
    }

    const [doctors, clinics, services, patients] = await Promise.all([
      this.dependencies.loadDoctors(input.scope),
      this.dependencies.loadClinics(input.scope),
      this.dependencies.loadServices(input.scope),
      this.dependencies.loadPatients(input.scope),
    ]);

    const snapshot: SttVocabularySnapshot = {
      doctors,
      clinics,
      services,
      patients,
      terms: uniqueTerms([
        ...DENTAL_BASE_TERMS,
        ...doctors.map((item) => item.label),
        ...clinics.map((item) => item.label),
        ...services.map((item) => item.label),
      ]),
    };
    this.cache.set(tenantId, {
      snapshot,
      expiresAtMs: this.now() + this.cacheTtlMs,
    });

    return snapshot;
  }
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}
