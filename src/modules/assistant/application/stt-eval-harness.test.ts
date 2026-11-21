import { describe, expect, it } from 'vitest';

import { STT_EVAL_FIXTURES } from './stt-eval-fixtures.test-data';
import { runSttEvaluation } from './stt-eval-harness';

describe('runSttEvaluation', () => {
  it('computes per-bucket WER/CER for ar, en, mixed', () => {
    const report = runSttEvaluation({
      samples: STT_EVAL_FIXTURES,
    });

    expect(report.werByBucket.ar).toBe(0);
    expect(report.werByBucket.en).toBe(0.5);
    expect(report.werByBucket.mixed).toBe(0.5);

    expect(report.cerByBucket.ar).toBe(0);
    expect(report.cerByBucket.en).toBeCloseTo(0.5455, 4);
    expect(report.cerByBucket.mixed).toBeCloseTo(0.6, 4);
  });

  it('computes entity accuracy from expected entity spans', () => {
    const report = runSttEvaluation({
      samples: STT_EVAL_FIXTURES,
    });

    expect(report.entityAccuracy).toBeCloseTo(2 / 3, 4);
  });
});
