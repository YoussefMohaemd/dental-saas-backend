import { describe, expect, it } from 'vitest';

import { normalizeArabic } from './arabic-normalize';

describe('normalizeArabic', () => {
  it('removes Arabic diacritics and tatweel', () => {
    expect(normalizeArabic('يُوسُف ـ')).toBe('يوسف');
  });

  it('normalizes Arabic-Indic digits', () => {
    expect(normalizeArabic('٣٦')).toBe('36');
  });

  it('normalizes Arabic letter variants and Latin casing', () => {
    expect(normalizeArabic('مصطفى Mustafa')).toBe('مصطفي mustafa');
  });
});
