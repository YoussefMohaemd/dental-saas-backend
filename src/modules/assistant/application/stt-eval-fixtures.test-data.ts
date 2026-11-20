import { type EvalInput, type EvalReport } from './stt-eval-harness';

export const sttEvalFixtureInput: EvalInput = {
  samples: [
    {
      bucket: 'ar',
      reference: 'مرحبا بكم',
      hypothesis: 'مرحبا',
      expectedEntitySpans: ['مرحبا', 'بكم'],
    },
    {
      bucket: 'en',
      reference: 'hello world',
      hypothesis: 'hello brave world',
      expectedEntitySpans: ['brave'],
    },
    {
      bucket: 'mixed',
      reference: 'موعد checkup اليوم',
      hypothesis: 'موعد check اليوم',
      expectedEntitySpans: ['checkup', 'اليوم'],
    },
  ],
};

export const sttEvalExpectedReport: EvalReport = {
  werByBucket: {
    ar: 0.5,
    en: 0.5,
    mixed: 1 / 3,
  },
  cerByBucket: {
    ar: 0.375,
    en: 0.5,
    mixed: 0.125,
  },
  entityAccuracy: 0.6,
};
