import { describe, expect, it } from 'vitest';

import {
  characterErrorRate,
  normalizeForScoring,
  runSttEvaluation,
  serializeSttEvalReport,
  wordErrorRate,
  type SttEvalSample,
} from './wer';

const FIXED_TIME = new Date('2026-11-20T15:10:20.123Z');

function sample(overrides: Partial<SttEvalSample> & Pick<SttEvalSample, 'id'>): SttEvalSample {
  return {
    category: 'en',
    reference: '',
    hypothesis: '',
    expectedEntities: [],
    ...overrides,
  };
}

describe('normalizeForScoring', () => {
  it('lowercases, removes punctuation, and collapses whitespace', () => {
    expect(normalizeForScoring('  Hello,   WORLD!  ')).toBe('hello world');
  });

  it('strips Arabic diacritics and tatweel but preserves the letters', () => {
    expect(normalizeForScoring('يُوسُف مـــحمد')).toBe('يوسف محمد');
  });

  it('unifies Arabic alef variants and alef maqsura for scoring', () => {
    expect(normalizeForScoring('أحمد إبراهيم آدم مصطفى')).toBe('احمد ابراهيم ادم مصطفي');
  });

  it('converts Arabic-Indic digits to ASCII digits', () => {
    expect(normalizeForScoring('الطلب ١٢٣٤')).toBe('الطلب 1234');
  });

  it('removes invisible directional characters', () => {
    expect(normalizeForScoring('\u200fمرحبا\u200e')).toBe('مرحبا');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeForScoring('   ')).toBe('');
  });
});

describe('wordErrorRate', () => {
  it('returns 0 for identical transcripts', () => {
    expect(wordErrorRate('the quick brown fox', 'the quick brown fox')).toBe(0);
  });

  it('counts deletions, insertions, and substitutions against the reference length', () => {
    expect(wordErrorRate('the quick brown fox', 'the quick brown')).toBe(0.25);
    expect(wordErrorRate('the quick brown fox', 'the quick brown fox jumps')).toBe(0.25);
    expect(wordErrorRate('the quick brown fox', 'the quick brown cat')).toBe(0.25);
  });

  it('is insensitive to case and punctuation', () => {
    expect(wordErrorRate('Hello, world!', 'hello world')).toBe(0);
  });

  it('scores Arabic transcripts', () => {
    expect(wordErrorRate('مرحبا بكم', 'مرحبا')).toBe(0.5);
  });

  it('returns null when the reference has no words', () => {
    expect(wordErrorRate('', '')).toBeNull();
    expect(wordErrorRate('', 'thanks for watching')).toBeNull();
  });

  it('returns 1 when every reference word is missing', () => {
    expect(wordErrorRate('مرحبا بكم', '')).toBe(1);
  });
});

describe('characterErrorRate', () => {
  it('returns 0 for identical transcripts', () => {
    expect(characterErrorRate('hello world', 'hello world')).toBe(0);
  });

  it('counts character substitutions against the reference length', () => {
    expect(characterErrorRate('hello', 'hallo')).toBe(0.2);
  });

  it('ignores whitespace when counting characters', () => {
    expect(characterErrorRate('hello world', 'helloworld')).toBe(0);
  });

  it('scores Arabic characters', () => {
    expect(characterErrorRate('مرحبا بكم', 'مرحبا')).toBe(0.375);
  });

  it('returns null when the reference has no characters', () => {
    expect(characterErrorRate('', 'anything')).toBeNull();
  });
});

describe('runSttEvaluation', () => {
  it('aggregates WER and CER per category from error and reference totals', () => {
    const report = runSttEvaluation({
      generatedAt: FIXED_TIME,
      samples: [
        sample({
          id: 'en-1',
          reference: 'one two three four',
          hypothesis: 'one two three',
          expectedEntities: ['three'],
        }),
        sample({
          id: 'en-2',
          reference: 'a b c d e f g h i j',
          hypothesis: 'a b c d e f g h i j',
          expectedEntities: ['missing'],
        }),
      ],
    });

    // 1 missing word out of 14 reference words, not the mean of 0.25 and 0.
    expect(report.categories.en.wer).toBeCloseTo(1 / 14, 6);
    // 4 missing characters out of 25 reference characters.
    expect(report.categories.en.cer).toBeCloseTo(4 / 25, 6);
    expect(report.categories.en.entityAccuracy).toBe(0.5);
    expect(report.categories.en.sampleCount).toBe(2);
  });

  it('reports every dataset category even when it has no samples', () => {
    const report = runSttEvaluation({ samples: [], generatedAt: FIXED_TIME });

    expect(Object.keys(report.categories)).toEqual(['ar', 'en', 'mixed', 'entity', 'silence']);
    expect(Object.values(report.categories).every((category) => category.wer === null)).toBe(true);
  });

  it('compares Arabic, English, mixed-language, entity-focused, and silence buckets', () => {
    const report = runSttEvaluation({
      generatedAt: FIXED_TIME,
      samples: [
        sample({
          id: 'ar-1',
          category: 'ar',
          reference: 'مرحبا بكم',
          hypothesis: 'مرحبا',
          expectedEntities: ['مرحبا', 'بكم'],
        }),
        sample({
          id: 'en-1',
          category: 'en',
          reference: 'hello world',
          hypothesis: 'hello brave world',
          expectedEntities: ['brave'],
        }),
        sample({
          id: 'mixed-1',
          category: 'mixed',
          reference: 'موعد checkup اليوم',
          hypothesis: 'موعد check اليوم',
          expectedEntities: ['checkup', 'اليوم'],
        }),
        sample({
          id: 'entity-1',
          category: 'entity',
          reference: 'Dr. Ali ordered a molar crown',
          hypothesis: 'dr ali ordered a molar crown',
          expectedEntities: ['Dr. Ali', 'molar crown', 'Ali'],
        }),
        sample({
          id: 'silence-1',
          category: 'silence',
          reference: '',
          hypothesis: 'Thanks for watching!',
        }),
      ],
    });

    expect(report.categories.ar.wer).toBe(0.5);
    expect(report.categories.ar.cer).toBe(0.375);
    expect(report.categories.en.wer).toBe(0.5);
    expect(report.categories.mixed.wer).toBeCloseTo(1 / 3, 6);
    expect(report.categories.entity.wer).toBe(0);
    expect(report.categories.entity.entityAccuracy).toBe(1);
    expect(report.categories.silence.wer).toBeNull();
    expect(report.categories.silence.hallucinationCount).toBe(1);
  });

  it('measures entity accuracy with whole-phrase matching instead of substrings', () => {
    const report = runSttEvaluation({
      generatedAt: FIXED_TIME,
      samples: [
        sample({
          id: 'entity-1',
          category: 'entity',
          reference: 'the clinic is open',
          hypothesis: 'the clinic is open',
          expectedEntities: ['in'],
        }),
      ],
    });

    expect(report.categories.entity.entityAccuracy).toBe(0);
  });

  it('detects hallucinations only when a silence recording is non-empty', () => {
    const report = runSttEvaluation({
      generatedAt: FIXED_TIME,
      samples: [
        sample({
          id: 'silence-1',
          category: 'silence',
          hypothesis: 'Thank you for watching',
        }),
        sample({ id: 'silence-2', category: 'silence', hypothesis: '   ' }),
      ],
    });

    expect(report.categories.silence.hallucinationCount).toBe(1);
    expect(report.categories.silence.sampleCount).toBe(2);
  });

  it('reports entity accuracy as null when there are no expected entities', () => {
    const report = runSttEvaluation({
      generatedAt: FIXED_TIME,
      samples: [sample({ id: 'en-1', reference: 'hello', hypothesis: 'hello' })],
    });

    expect(report.categories.en.entityAccuracy).toBeNull();
    expect(report.overall.entityAccuracy).toBeNull();
  });

  it('computes overall metrics across all categories', () => {
    const report = runSttEvaluation({
      generatedAt: FIXED_TIME,
      samples: [
        sample({
          id: 'ar-1',
          category: 'ar',
          reference: 'مرحبا بكم',
          hypothesis: 'مرحبا',
          expectedEntities: ['مرحبا', 'بكم'],
        }),
        sample({ id: 'silence-1', category: 'silence', hypothesis: 'Thanks for watching!' }),
      ],
    });

    expect(report.overall.sampleCount).toBe(2);
    expect(report.overall.wer).toBe(0.5);
    expect(report.overall.cer).toBe(0.375);
    expect(report.overall.entityAccuracy).toBe(0.5);
    expect(report.overall.hallucinationCount).toBe(1);
  });

  it('keeps the migrated baseline fixture values for Arabic, English, and mixed samples', () => {
    const report = runSttEvaluation({
      generatedAt: FIXED_TIME,
      samples: [
        sample({
          id: 'ar-1',
          category: 'ar',
          reference: 'مرحبا بكم',
          hypothesis: 'مرحبا',
          expectedEntities: ['مرحبا', 'بكم'],
        }),
        sample({
          id: 'en-1',
          category: 'en',
          reference: 'hello world',
          hypothesis: 'hello brave world',
          expectedEntities: ['brave'],
        }),
        sample({
          id: 'mixed-1',
          category: 'mixed',
          reference: 'موعد checkup اليوم',
          hypothesis: 'موعد check اليوم',
          expectedEntities: ['checkup', 'اليوم'],
        }),
      ],
    });

    expect(report.categories.ar.wer).toBe(0.5);
    expect(report.categories.ar.cer).toBe(0.375);
    expect(report.categories.en.wer).toBe(0.5);
    expect(report.categories.en.cer).toBe(0.5);
    expect(report.categories.mixed.wer).toBeCloseTo(1 / 3, 6);
    expect(report.categories.mixed.cer).toBe(0.125);
    expect(report.overall.entityAccuracy).toBe(0.6);
  });

  it('produces a deterministic report that can be diffed between runs', () => {
    const samples = [
      sample({ id: 'en-2', reference: 'hello world', hypothesis: 'hello word' }),
      sample({ id: 'ar-1', category: 'ar', reference: 'مرحبا بكم', hypothesis: 'مرحبا' }),
    ];

    const first = runSttEvaluation({ samples, generatedAt: FIXED_TIME });
    const second = runSttEvaluation({
      samples: [...samples].reverse(),
      generatedAt: FIXED_TIME,
    });

    expect(serializeSttEvalReport(second)).toBe(serializeSttEvalReport(first));
    expect(first.generatedAt).toBe('2026-11-20T15:10:20.123Z');
    expect(first.schemaVersion).toBe(1);
    expect(first.samples.map((item) => item.id)).toEqual(['ar-1', 'en-2']);
  });

  it('never embeds reference or hypothesis text in the report', () => {
    const report = runSttEvaluation({
      generatedAt: FIXED_TIME,
      samples: [
        sample({
          id: 'en-1',
          reference: 'the patient has a severe toothache',
          hypothesis: 'the patient has a tooth ache',
        }),
      ],
    });

    const serialized = serializeSttEvalReport(report);

    expect(serialized).not.toContain('patient');
    expect(serialized).not.toContain('tooth');
  });
});
