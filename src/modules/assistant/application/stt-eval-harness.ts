export type EvalSample = {
  bucket: string;
  reference: string;
  hypothesis: string;
  expectedEntitySpans: string[];
};

export type EvalInput = {
  samples: EvalSample[];
};

export type EvalReport = {
  werByBucket: Record<string, number>;
  cerByBucket: Record<string, number>;
  entityAccuracy: number;
};

type BucketTotals = {
  wordDistance: number;
  wordReferenceLength: number;
  charDistance: number;
  charReferenceLength: number;
};

export function runSttEvaluation(input: EvalInput): EvalReport {
  const byBucket = new Map<string, BucketTotals>();
  let totalExpectedEntities = 0;
  let totalMatchedEntities = 0;

  for (const sample of input.samples) {
    const bucket = sample.bucket;
    const totals = byBucket.get(bucket) ?? {
      wordDistance: 0,
      wordReferenceLength: 0,
      charDistance: 0,
      charReferenceLength: 0,
    };

    const referenceWords = tokenizeWords(sample.reference);
    const hypothesisWords = tokenizeWords(sample.hypothesis);
    totals.wordDistance += levenshtein(referenceWords, hypothesisWords);
    totals.wordReferenceLength += referenceWords.length;

    const referenceChars = tokenizeCharacters(sample.reference);
    const hypothesisChars = tokenizeCharacters(sample.hypothesis);
    totals.charDistance += levenshtein(referenceChars, hypothesisChars);
    totals.charReferenceLength += referenceChars.length;
    byBucket.set(bucket, totals);

    const normalizedHypothesis = normalizeText(sample.hypothesis);
    for (const entity of sample.expectedEntitySpans) {
      const normalizedEntity = normalizeText(entity);
      totalExpectedEntities += 1;
      if (
        normalizedEntity.length > 0 &&
        normalizedHypothesis.includes(normalizedEntity)
      ) {
        totalMatchedEntities += 1;
      }
    }
  }

  const sortedBuckets = Array.from(byBucket.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  const werByBucket: Record<string, number> = {};
  const cerByBucket: Record<string, number> = {};

  for (const bucket of sortedBuckets) {
    const totals = byBucket.get(bucket);
    if (!totals) {
      continue;
    }
    werByBucket[bucket] = safeDivide(totals.wordDistance, totals.wordReferenceLength);
    cerByBucket[bucket] = safeDivide(totals.charDistance, totals.charReferenceLength);
  }

  return {
    werByBucket,
    cerByBucket,
    entityAccuracy: safeDivide(totalMatchedEntities, totalExpectedEntities, 1),
  };
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function tokenizeWords(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }
  return normalized.split(' ');
}

function tokenizeCharacters(value: string): string[] {
  return normalizeText(value).replace(/\s+/g, '').split('');
}

function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0) {
    return fallback;
  }
  return numerator / denominator;
}

function levenshtein(left: string[], right: string[]): number {
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }

  const previous = new Array<number>(right.length + 1);
  const current = new Array<number>(right.length + 1);

  for (let j = 0; j <= right.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}
