import { describe, expect, it } from 'vitest';

import {
  sttEvalExpectedReport,
  sttEvalFixtureInput,
} from './stt-eval-fixtures.test-data';
import { runSttEvaluation } from './stt-eval-harness';

describe('runSttEvaluation', () => {
  it('computes per-bucket WER/CER for ar, en, mixed', () => {
    const report = runSttEvaluation(sttEvalFixtureInput);

    expect(Object.keys(report.werByBucket).sort()).toEqual(['ar', 'en', 'mixed']);
    expect(Object.keys(report.cerByBucket).sort()).toEqual(['ar', 'en', 'mixed']);

    expect(report.werByBucket.ar).toBeCloseTo(sttEvalExpectedReport.werByBucket.ar, 10);
    expect(report.werByBucket.en).toBeCloseTo(sttEvalExpectedReport.werByBucket.en, 10);
    expect(report.werByBucket.mixed).toBeCloseTo(
      sttEvalExpectedReport.werByBucket.mixed,
      10,
    );

    expect(report.cerByBucket.ar).toBeCloseTo(sttEvalExpectedReport.cerByBucket.ar, 10);
    expect(report.cerByBucket.en).toBeCloseTo(sttEvalExpectedReport.cerByBucket.en, 10);
    expect(report.cerByBucket.mixed).toBeCloseTo(
      sttEvalExpectedReport.cerByBucket.mixed,
      10,
    );
  });

  it('computes entity accuracy from expected entity spans', () => {
    const report = runSttEvaluation(sttEvalFixtureInput);

    expect(report.entityAccuracy).toBeCloseTo(sttEvalExpectedReport.entityAccuracy, 10);
  });
});
