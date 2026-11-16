import { describe, expect, it } from 'vitest';

import {
  buildBilingualSearchRegexes,
  matchesBilingualEntityName,
  matchesBilingualText,
} from './bilingual-search';

describe('bilingual search', () => {
  it('matches exact Latin text case-insensitively', () => {
    expect(matchesBilingualText('omar khalil', 'Omar Khalil')).toBe(true);
    const [regex] = buildBilingualSearchRegexes('Omar Khalil');
    expect(regex?.test('omar khalil')).toBe(true);
  });

  it('matches Arabic doctor names against Latin records', () => {
    expect(matchesBilingualText('عمر خليل', 'Omar Khalil')).toBe(true);
  });

  it('matches Arabic patient names with multi-letter consonants', () => {
    expect(matchesBilingualText('سيف', 'Saif')).toBe(true);
    expect(matchesBilingualText('خالد', 'Khaled')).toBe(true);
  });

  it('matches common Latin transliteration variants for the same name', () => {
    expect(matchesBilingualText('sief', 'Saif')).toBe(true);
    expect(matchesBilingualEntityName('sief', 'Saif')).toBe(true);
    expect(buildBilingualSearchRegexes('sief').some((regex) => regex.test('Saif'))).toBe(true);
  });

  it('matches Arabic entity names without accepting unrelated Latin names', () => {
    expect(matchesBilingualEntityName('عمر', 'Omar')).toBe(true);
    expect(matchesBilingualEntityName('عمر', 'Mary')).toBe(false);
    expect(matchesBilingualEntityName('عمر', 'Omar Khalil')).toBe(false);
    expect(matchesBilingualEntityName('عمر', 'Amir')).toBe(false);
    expect(matchesBilingualEntityName('عمر', 'Mare')).toBe(false);
  });

  it('normalizes Arabic diacritics and tatweel before matching', () => {
    expect(matchesBilingualText('عُمَـر خَلِيل', 'Omar Khalil')).toBe(true);
  });

  it('keeps non-Arabic searches literal and escaped', () => {
    const [regex] = buildBilingualSearchRegexes('A+B');
    expect(regex?.test('A+B')).toBe(true);
    expect(regex?.test('AAAB')).toBe(false);
    expect(matchesBilingualText('A+B', 'A+B')).toBe(true);
  });

  it('does not match empty input', () => {
    expect(buildBilingualSearchRegexes('')).toEqual([]);
    expect(matchesBilingualText('', 'Omar Khalil')).toBe(false);
  });

  it('handles long nonmatching transliterations without ambiguous regex growth', () => {
    expect(matchesBilingualEntityName('ع'.repeat(20), `${'a'.repeat(100)}z`)).toBe(false);
  });
});
