/**
 * Evaluation-only scoring for speech-to-text transcripts.
 *
 * Nothing in this module runs in the transcription pipeline: it exists so that
 * baseline and post-change reports can be compared using the same normalization,
 * WER/CER formulas, and entity matching rules.
 */

export const STT_EVAL_CATEGORIES = ['ar', 'en', 'mixed', 'entity', 'silence'] as const;

export type SttEvalCategory = (typeof STT_EVAL_CATEGORIES)[number];

export interface SttEvalSample {
  id: string;
  category: SttEvalCategory;
  reference: string;
  hypothesis: string;
  expectedEntities: readonly string[];
}

export interface SttEvalCategoryReport {
  sampleCount: number;
  referenceWordCount: number;
  wordErrorCount: number;
  wer: number | null;
  referenceCharacterCount: number;
  characterErrorCount: number;
  cer: number | null;
  expectedEntityCount: number;
  matchedEntityCount: number;
  entityAccuracy: number | null;
  hallucinationCount: number;
}

export interface SttEvalSampleReport {
  id: string;
  category: SttEvalCategory;
  wer: number | null;
  cer: number | null;
  entityAccuracy: number | null;
  hallucinated: boolean;
}

export interface SttEvalReport {
  schemaVersion: 1;
  generatedAt: string;
  categories: Record<SttEvalCategory, SttEvalCategoryReport>;
  overall: SttEvalCategoryReport;
  samples: SttEvalSampleReport[];
}

export interface SttEvalInput {
  samples: readonly SttEvalSample[];
  generatedAt?: Date;
}

const ARABIC_DIACRITICS_PATTERN = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const ARABIC_TATWEEL_PATTERN = /\u0640/g;
const INVISIBLE_DIRECTIONAL_PATTERN = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const ARABIC_ALEF_PATTERN = /[\u0622\u0623\u0625\u0671]/g;
const ARABIC_ALEF_MAQSURA_PATTERN = /\u0649/g;
const ARABIC_INDIC_DIGITS_PATTERN = /[\u0660-\u0669]/g;
const EXTENDED_ARABIC_INDIC_DIGITS_PATTERN = /[\u06f0-\u06f9]/g;
const NON_SCORING_CHARACTER_PATTERN = /[^\p{L}\p{N}\p{M}\s]/gu;
const WHITESPACE_PATTERN = /\s+/g;
const RATE_PRECISION = 6;

interface ScoringTotals {
  sampleCount: number;
  referenceWordCount: number;
  wordErrorCount: number;
  referenceCharacterCount: number;
  characterErrorCount: number;
  expectedEntityCount: number;
  matchedEntityCount: number;
  hallucinationCount: number;
}

interface SampleScoring {
  referenceWordCount: number;
  wordErrorCount: number;
  referenceCharacterCount: number;
  characterErrorCount: number;
  expectedEntityCount: number;
  matchedEntityCount: number;
  hallucinated: boolean;
}

/**
 * Normalizes a transcript for scoring only. It must never be used to rewrite
 * transcripts returned to users.
 *
 * The rules are deliberately language-aware but conservative:
 * - Arabic diacritics and tatweel are stripped because ASR providers usually
 *   omit them while reference transcripts may include them.
 * - Arabic alef variants and alef maqsura are unified because they are
 *   orthographic variants, not different pronunciations.
 * - Arabic-Indic digits are converted to ASCII digits so order numbers compare.
 * - Punctuation, invisible directional characters, case, and whitespace are
 *   removed so that formatting differences do not count as transcription errors.
 */
export function normalizeForScoring(value: string): string {
  return value
    .normalize('NFKC')
    .replace(INVISIBLE_DIRECTIONAL_PATTERN, '')
    .replace(ARABIC_DIACRITICS_PATTERN, '')
    .replace(ARABIC_TATWEEL_PATTERN, '')
    .replace(ARABIC_ALEF_PATTERN, '\u0627')
    .replace(ARABIC_ALEF_MAQSURA_PATTERN, '\u064a')
    .replace(ARABIC_INDIC_DIGITS_PATTERN, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - 0x0660 + 0x30),
    )
    .replace(EXTENDED_ARABIC_INDIC_DIGITS_PATTERN, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - 0x06f0 + 0x30),
    )
    .toLowerCase()
    .replace(NON_SCORING_CHARACTER_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
}

/**
 * Word Error Rate: token-level Levenshtein distance divided by the number of
 * reference words. Returns null when the reference has no words (silence
 * recordings are measured with the hallucination count instead).
 */
export function wordErrorRate(reference: string, hypothesis: string): number | null {
  const referenceWords = tokenizeWords(normalizeForScoring(reference));
  if (referenceWords.length === 0) {
    return null;
  }

  const hypothesisWords = tokenizeWords(normalizeForScoring(hypothesis));
  return levenshteinDistance(referenceWords, hypothesisWords) / referenceWords.length;
}

/**
 * Character Error Rate: character-level Levenshtein distance divided by the
 * number of reference characters. Whitespace is excluded so that word-boundary
 * mistakes are measured by WER rather than counted twice here.
 */
export function characterErrorRate(reference: string, hypothesis: string): number | null {
  const referenceCharacters = tokenizeCharacters(normalizeForScoring(reference));
  if (referenceCharacters.length === 0) {
    return null;
  }

  const hypothesisCharacters = tokenizeCharacters(normalizeForScoring(hypothesis));
  return (
    levenshteinDistance(referenceCharacters, hypothesisCharacters) / referenceCharacters.length
  );
}

export function runSttEvaluation(input: SttEvalInput): SttEvalReport {
  const orderedSamples = [...input.samples].sort(compareSamples);
  const totalsByCategory = new Map<SttEvalCategory, ScoringTotals>();
  const overallTotals = createTotals();
  const sampleReports: SttEvalSampleReport[] = [];

  for (const sample of orderedSamples) {
    const scoring = scoreSample(sample);
    const categoryTotals = totalsByCategory.get(sample.category) ?? createTotals();
    accumulate(categoryTotals, scoring);
    accumulate(overallTotals, scoring);
    totalsByCategory.set(sample.category, categoryTotals);
    sampleReports.push(toSampleReport(sample, scoring));
  }

  const categories = {} as Record<SttEvalCategory, SttEvalCategoryReport>;
  for (const category of STT_EVAL_CATEGORIES) {
    categories[category] = toCategoryReport(totalsByCategory.get(category) ?? createTotals());
  }

  return {
    schemaVersion: 1,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    categories,
    overall: toCategoryReport(overallTotals),
    samples: sampleReports,
  };
}

export function serializeSttEvalReport(report: SttEvalReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function scoreSample(sample: SttEvalSample): SampleScoring {
  const referenceNormalized = normalizeForScoring(sample.reference);
  const hypothesisNormalized = normalizeForScoring(sample.hypothesis);
  const referenceWords = tokenizeWords(referenceNormalized);
  const hypothesisWords = tokenizeWords(hypothesisNormalized);
  const referenceCharacters = tokenizeCharacters(referenceNormalized);
  const hypothesisCharacters = tokenizeCharacters(hypothesisNormalized);
  const entities = countExpectedEntities(sample.expectedEntities, hypothesisNormalized);
  const wordErrorCount =
    referenceWords.length === 0 ? 0 : levenshteinDistance(referenceWords, hypothesisWords);
  const characterErrorCount =
    referenceCharacters.length === 0
      ? 0
      : levenshteinDistance(referenceCharacters, hypothesisCharacters);

  return {
    referenceWordCount: referenceWords.length,
    wordErrorCount,
    referenceCharacterCount: referenceCharacters.length,
    characterErrorCount,
    expectedEntityCount: entities.expected,
    matchedEntityCount: entities.matched,
    hallucinated: referenceWords.length === 0 && hypothesisNormalized.length > 0,
  };
}

function countExpectedEntities(
  expectedEntities: readonly string[],
  normalizedHypothesis: string,
): { expected: number; matched: number } {
  let expected = 0;
  let matched = 0;
  const paddedHypothesis = ` ${normalizedHypothesis} `;

  for (const entity of expectedEntities) {
    const normalizedEntity = normalizeForScoring(entity);
    if (normalizedEntity.length === 0) {
      continue;
    }

    expected += 1;
    if (paddedHypothesis.includes(` ${normalizedEntity} `)) {
      matched += 1;
    }
  }

  return { expected, matched };
}

function createTotals(): ScoringTotals {
  return {
    sampleCount: 0,
    referenceWordCount: 0,
    wordErrorCount: 0,
    referenceCharacterCount: 0,
    characterErrorCount: 0,
    expectedEntityCount: 0,
    matchedEntityCount: 0,
    hallucinationCount: 0,
  };
}

function accumulate(totals: ScoringTotals, scoring: SampleScoring): void {
  totals.sampleCount += 1;
  totals.referenceWordCount += scoring.referenceWordCount;
  totals.wordErrorCount += scoring.wordErrorCount;
  totals.referenceCharacterCount += scoring.referenceCharacterCount;
  totals.characterErrorCount += scoring.characterErrorCount;
  totals.expectedEntityCount += scoring.expectedEntityCount;
  totals.matchedEntityCount += scoring.matchedEntityCount;
  if (scoring.hallucinated) {
    totals.hallucinationCount += 1;
  }
}

function toCategoryReport(totals: ScoringTotals): SttEvalCategoryReport {
  return {
    sampleCount: totals.sampleCount,
    referenceWordCount: totals.referenceWordCount,
    wordErrorCount: totals.wordErrorCount,
    wer: safeRate(totals.wordErrorCount, totals.referenceWordCount),
    referenceCharacterCount: totals.referenceCharacterCount,
    characterErrorCount: totals.characterErrorCount,
    cer: safeRate(totals.characterErrorCount, totals.referenceCharacterCount),
    expectedEntityCount: totals.expectedEntityCount,
    matchedEntityCount: totals.matchedEntityCount,
    entityAccuracy: safeRate(totals.matchedEntityCount, totals.expectedEntityCount),
    hallucinationCount: totals.hallucinationCount,
  };
}

function toSampleReport(sample: SttEvalSample, scoring: SampleScoring): SttEvalSampleReport {
  return {
    id: sample.id,
    category: sample.category,
    wer: safeRate(scoring.wordErrorCount, scoring.referenceWordCount),
    cer: safeRate(scoring.characterErrorCount, scoring.referenceCharacterCount),
    entityAccuracy: safeRate(scoring.matchedEntityCount, scoring.expectedEntityCount),
    hallucinated: scoring.hallucinated,
  };
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(RATE_PRECISION));
}

function tokenizeWords(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(' ');
}

function tokenizeCharacters(normalized: string): string[] {
  return Array.from(normalized.replace(WHITESPACE_PATTERN, ''));
}

function compareSamples(left: SttEvalSample, right: SttEvalSample): number {
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

function levenshteinDistance(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }

  let previous = new Array<number>(right.length + 1);
  let current = new Array<number>(right.length + 1);

  for (let column = 0; column <= right.length; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    const leftToken = left[row - 1];

    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = leftToken === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + substitutionCost,
      );
    }

    [previous, current] = [current, previous];
  }

  return previous[right.length] ?? right.length;
}
