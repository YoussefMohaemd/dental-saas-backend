import { describe, expect, it } from 'vitest';

import { EntityCorrector } from './entity-corrector';

describe('EntityCorrector', () => {
  it('corrects high-confidence same-script doctor names', () => {
    const corrector = new EntityCorrector();

    const result = corrector.correct({
      text: 'book with ahmedd tomorrow',
      vocabulary: {
        terms: [],
        doctors: [{ id: 'd1', label: 'Ahmed' }],
        clinics: [],
        services: [],
        patients: [],
      },
    });

    expect(result.text).toContain('Ahmed');
    expect(result.ambiguities).toEqual([]);
  });

  it('returns ambiguity when top candidates are too close', () => {
    const corrector = new EntityCorrector();

    const result = corrector.correct({
      text: 'book with ahmd',
      vocabulary: {
        terms: [],
        doctors: [
          { id: 'd1', label: 'Ahmed' },
          { id: 'd2', label: 'Ahmad' },
        ],
        clinics: [],
        services: [],
        patients: [],
      },
    });

    expect(result.text).toBe('book with ahmd');
    expect(result.ambiguities).toEqual([
      {
        kind: 'doctor',
        candidates: [
          { id: 'd1', label: 'Ahmed' },
          { id: 'd2', label: 'Ahmad' },
        ],
      },
    ]);
  });

  it('does not cross-script replace Arabic with Latin or inverse', () => {
    const corrector = new EntityCorrector();

    const result = corrector.correct({
      text: 'احجز مع احمد',
      vocabulary: {
        terms: [],
        doctors: [{ id: 'd1', label: 'Ahmed' }],
        clinics: [],
        services: [],
        patients: [],
      },
    });

    expect(result.text).toBe('احجز مع احمد');
    expect(result.ambiguities).toEqual([]);
  });
});
