type Bucket = 'ar' | 'en' | 'mixed';

export interface EvalSample {
  bucket: Bucket;
  referenceText: string;
  hypothesisText: string;
  expectedEntities?: string[];
  detectedEntities?: string[];
}

export interface EvalInput {
  samples: EvalSample[];
}

export interface EvalReport {
  werByBucket: Record<Bucket, number>;
  cerByBucket: Record<Bucket, number>;
  entityAccuracy: number;
}

export function runSttEvaluation(input: EvalInput): EvalReport {
  const werByBucket = computeByBucket(input.samples, (sample) =>
    distance(tokenizeWords(sample.referenceText), tokenizeWords(sample.hypothesisText)),
  );
  const cerByBucket = computeByBucket(input.samples, (sample) =>
    distance(tokenizeChars(sample.referenceText), tokenizeChars(sample.hypothesisText)),
  );

  const { hits, total } = input.samples.reduce(
    (accumulator, sample) => {
      const expected = sample.expectedEntities ?? [];
      const detected = new Set((sample.detectedEntities ?? []).map((item) => normalize(item)));

      for (const expectedEntity of expected) {
        accumulator.total += 1;
        if (detected.has(normalize(expectedEntity))) {
          accumulator.hits += 1;
        }
      }

      return accumulator;
    },
    { hits: 0, total: 0 },
  );

  return {
    werByBucket,
    cerByBucket,
    entityAccuracy: total > 0 ? hits / total : 0,
  };
}

function computeByBucket(
  samples: EvalSample[],
  unitDistance: (sample: EvalSample) => { edits: number; referenceLength: number },
): Record<Bucket, number> {
  const totals: Record<Bucket, { edits: number; referenceLength: number }> = {
    ar: { edits: 0, referenceLength: 0 },
    en: { edits: 0, referenceLength: 0 },
    mixed: { edits: 0, referenceLength: 0 },
  };

  for (const sample of samples) {
    const result = unitDistance(sample);
    totals[sample.bucket].edits += result.edits;
    totals[sample.bucket].referenceLength += result.referenceLength;
  }

  return {
    ar: ratio(totals.ar),
    en: ratio(totals.en),
    mixed: ratio(totals.mixed),
  };
}

function tokenizeWords(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed.split(/\s+/g);
}

function tokenizeChars(value: string): string[] {
  return [...value.replace(/\s+/g, '')];
}

function distance(reference: string[], hypothesis: string[]): { edits: number; referenceLength: number } {
  const rows = reference.length + 1;
  const columns = hypothesis.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row]![0] = row;
  }
  for (let column = 0; column < columns; column += 1) {
    matrix[0]![column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = reference[row - 1] === hypothesis[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + substitutionCost,
      );
    }
  }

  return {
    edits: matrix[rows - 1]![columns - 1]!,
    referenceLength: reference.length,
  };
}

function ratio(value: { edits: number; referenceLength: number }): number {
  if (value.referenceLength === 0) {
    return 0;
  }
  return Number((value.edits / value.referenceLength).toFixed(4));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
