import { normalizeArabic } from './arabic-normalize';

const ARABIC_LETTER_PATTERN = /[\u0600-\u06ff]/;
const EPENTHETIC_VOWELS = '[aeou]';
const MAX_SEARCH_LENGTH = 128;
const LATIN_TRANSLITERATION_VARIANTS: Record<string, string> = {
  ae: '(?:ae|ai|ay|ea|ei|ey|ie)',
  ai: '(?:ae|ai|ay|ea|ei|ey|ie)',
  ay: '(?:ae|ai|ay|ea|ei|ey|ie)',
  ea: '(?:ae|ai|ay|ea|ei|ey|ie)',
  ei: '(?:ae|ai|ay|ea|ei|ey|ie)',
  ey: '(?:ae|ai|ay|ea|ei|ey|ie)',
  ie: '(?:ae|ai|ay|ea|ei|ey|ie)',
};

const ARABIC_TO_LATIN_PATTERN: Record<string, string> = {
  ا: 'a',
  ب: '[bp]',
  ت: 't',
  ث: 'th',
  ج: '[jg]',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: '(?:dh|z)',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: '[aeiou]',
  غ: 'gh',
  ف: 'f',
  ق: '[qk]',
  ك: '[ck]',
  ل: 'l',
  م: 'm',
  ن: '(?:n|ni)',
  ه: 'h',
  و: '(?:w|o|u)',
  ي: '(?:y|i|e|a)',
  ء: '',
};

export function buildBilingualSearchRegexes(text: string): RegExp[] {
  const normalized = normalizeArabic(text).slice(0, MAX_SEARCH_LENGTH);
  if (!normalized) {
    return [];
  }

  const regexes = [new RegExp(escapeRegex(normalized), 'i')];
  if (ARABIC_LETTER_PATTERN.test(normalized)) {
    regexes.push(new RegExp(buildArabicTransliterationPattern(normalized), 'i'));
  } else {
    const latinPattern = buildLatinTransliterationPattern(normalized);
    if (latinPattern !== escapeRegex(normalized)) {
      regexes.push(new RegExp(latinPattern, 'i'));
    }
  }
  return regexes;
}

export function matchesBilingualEntityName(query: string, candidate: string): boolean {
  const normalizedQuery = normalizeArabic(query).slice(0, MAX_SEARCH_LENGTH);
  const normalizedCandidate = normalizeArabic(candidate);
  if (!normalizedQuery || !normalizedCandidate) {
    return false;
  }
  if (normalizedQuery === normalizedCandidate) {
    return true;
  }
  if (ARABIC_LETTER_PATTERN.test(normalizedQuery)) {
    return matchesArabicTransliteration(normalizedQuery, normalizedCandidate, true);
  }

  return new RegExp(buildLatinTransliterationPattern(normalizedQuery, true), 'i').test(
    normalizedCandidate,
  );
}

export function matchesBilingualText(query: string, candidate: string): boolean {
  const normalizedQuery = normalizeArabic(query).slice(0, MAX_SEARCH_LENGTH);
  const normalizedCandidate = normalizeArabic(candidate);
  if (!normalizedQuery || !normalizedCandidate) {
    return false;
  }
  if (normalizedQuery === normalizedCandidate) {
    return true;
  }
  if (ARABIC_LETTER_PATTERN.test(normalizedQuery)) {
    return matchesArabicTransliteration(normalizedQuery, normalizedCandidate, false);
  }

  return new RegExp(buildLatinTransliterationPattern(normalizedQuery), 'i').test(
    normalizedCandidate,
  );
}

function buildArabicTransliterationPattern(normalized: string, anchored = false): string {
  let pattern = anchored ? '^' : '';
  let hasToken = false;
  for (const character of normalized) {
    if (character === ' ') {
      pattern += '\\s+';
      hasToken = false;
      continue;
    }
    const segment = ARABIC_TO_LATIN_PATTERN[character] ?? escapeRegex(character);
    if (segment) {
      if (hasToken) {
        pattern += `(?:${segment}|${EPENTHETIC_VOWELS}${segment})`;
      } else {
        pattern += segment;
      }
      hasToken = true;
    }
  }
  return `${pattern}${anchored ? '$' : ''}`;
}

function buildLatinTransliterationPattern(normalized: string, anchored = false): string {
  let pattern = anchored ? '^' : '';
  for (let index = 0; index < normalized.length; index += 1) {
    const pair = normalized.slice(index, index + 2);
    const variant = LATIN_TRANSLITERATION_VARIANTS[pair];
    if (variant) {
      pattern += variant;
      index += 1;
      continue;
    }
    pattern += escapeRegex(normalized[index] ?? '');
  }
  return `${pattern}${anchored ? '$' : ''}`;
}

function matchesArabicTransliteration(
  normalizedQuery: string,
  normalizedCandidate: string,
  anchored: boolean,
): boolean {
  const queryWords = normalizedQuery.split(' ');
  const candidateWords = normalizedCandidate.split(' ');
  if (anchored && queryWords.length !== candidateWords.length) {
    return false;
  }

  const start = anchored ? 0 : 0;
  const end = anchored ? 1 : Math.max(0, candidateWords.length - queryWords.length + 1);
  for (let wordIndex = start; wordIndex < end; wordIndex += 1) {
    let matches = true;
    for (let queryIndex = 0; queryIndex < queryWords.length; queryIndex += 1) {
      if (
        !matchesArabicWord(
          queryWords[queryIndex] ?? '',
          candidateWords[wordIndex + queryIndex] ?? '',
        )
      ) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }
  return false;
}

function matchesArabicWord(query: string, candidate: string): boolean {
  let positions = new Set<number>([0]);
  const characters = [...query];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? '';
    const variants = ARABIC_TO_LATIN_VARIANTS[character] ?? [character];
    const nextPositions = new Set<number>();
    for (const position of positions) {
      for (const variant of variants) {
        const startsAt = index === 0 ? [position] : [position, position + 1];
        for (const start of startsAt) {
          if (start > position && !isEpentheticVowel(candidate[position] ?? '')) {
            continue;
          }
          if (candidate.startsWith(variant, start)) {
            nextPositions.add(start + variant.length);
          }
        }
      }
    }
    positions = nextPositions;
    if (positions.size === 0) {
      return false;
    }
  }

  return Array.from(positions).some(
    (position) =>
      position === candidate.length ||
      (position + 1 === candidate.length && isEpentheticVowel(candidate[position] ?? '')),
  );
}

function isEpentheticVowel(character: string): boolean {
  return character.length === 1 && 'aeou'.includes(character);
}

const ARABIC_TO_LATIN_VARIANTS: Record<string, string[]> = {
  ا: ['a'],
  ب: ['b', 'p'],
  ت: ['t'],
  ث: ['th'],
  ج: ['j', 'g'],
  ح: ['h'],
  خ: ['kh'],
  د: ['d'],
  ذ: ['dh', 'z'],
  ر: ['r'],
  ز: ['z'],
  س: ['s'],
  ش: ['sh'],
  ص: ['s'],
  ض: ['d'],
  ط: ['t'],
  ظ: ['z'],
  ع: ['a', 'e', 'i', 'o', 'u'],
  غ: ['gh'],
  ف: ['f'],
  ق: ['q', 'k'],
  ك: ['c', 'k'],
  ل: ['l'],
  م: ['m'],
  ن: ['n', 'ni'],
  ه: ['h'],
  و: ['w', 'o', 'u'],
  ي: ['y', 'i', 'e', 'a'],
  ء: [''],
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
