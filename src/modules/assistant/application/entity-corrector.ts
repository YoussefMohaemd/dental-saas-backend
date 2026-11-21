import { type SttVocabularyEntity, type SttVocabularySnapshot } from './stt-vocabulary-service';

export interface EntityAmbiguity {
  kind: 'doctor' | 'clinic' | 'service' | 'patient';
  candidates: Array<{ id: string; label: string }>;
}

const ARABIC_PATTERN = /[\u0600-\u06ff]/u;
const LATIN_PATTERN = /[A-Za-z]/u;
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;

export class EntityCorrector {
  public correct(input: {
    text: string;
    vocabulary: SttVocabularySnapshot;
  }): { text: string; ambiguities: EntityAmbiguity[] } {
    const tokens = input.text.match(WORD_PATTERN) ?? [];
    let nextText = input.text;
    const ambiguities: EntityAmbiguity[] = [];
    const seenAmbiguity = new Set<string>();

    for (const token of tokens) {
      const doctorResolution = this.resolveToken(token, input.vocabulary.doctors);
      if (doctorResolution.kind === 'replace') {
        nextText = replaceWholeWord(nextText, token, doctorResolution.candidate.label);
      } else if (doctorResolution.kind === 'ambiguity') {
        const key = buildAmbiguityKey('doctor', doctorResolution.candidates);
        if (!seenAmbiguity.has(key)) {
          ambiguities.push({
            kind: 'doctor',
            candidates: doctorResolution.candidates.map((item) => ({
              id: item.id,
              label: item.label,
            })),
          });
          seenAmbiguity.add(key);
        }
      }
    }

    return {
      text: nextText,
      ambiguities,
    };
  }

  private resolveToken(
    token: string,
    entities: SttVocabularyEntity[],
  ):
    | { kind: 'none' }
    | { kind: 'replace'; candidate: SttVocabularyEntity }
    | { kind: 'ambiguity'; candidates: SttVocabularyEntity[] } {
    const candidates = entities
      .filter((entity) => sameScript(token, entity.label))
      .map((entity) => ({
        entity,
        similarity: similarity(normalize(token), normalize(entity.label)),
      }))
      .filter((item) => item.similarity >= 0.75)
      .sort((left, right) => right.similarity - left.similarity);

    if (candidates.length === 0) {
      return { kind: 'none' };
    }

    const best = candidates[0]!;
    const second = candidates[1];
    if (
      best.similarity >= 0.8 &&
      (!second || best.similarity - second.similarity >= 0.04)
    ) {
      return { kind: 'replace', candidate: best.entity };
    }

    if (second && best.similarity - second.similarity < 0.04) {
      return {
        kind: 'ambiguity',
        candidates: [best.entity, second.entity],
      };
    }

    return { kind: 'none' };
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function similarity(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  const editDistance = levenshtein(left, right);
  return 1 - editDistance / Math.max(left.length, right.length);
}

function levenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let row = 0; row < rows; row += 1) {
    matrix[row]![0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    matrix[0]![col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row]![col] = Math.min(
        matrix[row - 1]![col]! + 1,
        matrix[row]![col - 1]! + 1,
        matrix[row - 1]![col - 1]! + cost,
      );
    }
  }

  return matrix[rows - 1]![cols - 1]!;
}

function sameScript(input: string, candidate: string): boolean {
  const inputArabic = ARABIC_PATTERN.test(input);
  const candidateArabic = ARABIC_PATTERN.test(candidate);
  if (inputArabic || candidateArabic) {
    return inputArabic === candidateArabic;
  }

  const inputLatin = LATIN_PATTERN.test(input);
  const candidateLatin = LATIN_PATTERN.test(candidate);
  if (inputLatin || candidateLatin) {
    return inputLatin === candidateLatin;
  }

  return true;
}

function replaceWholeWord(text: string, source: string, target: string): string {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'g');
  return text.replace(regex, target);
}

function buildAmbiguityKey(kind: EntityAmbiguity['kind'], entities: SttVocabularyEntity[]): string {
  return `${kind}:${entities.map((item) => item.id).sort().join(',')}`;
}
