import { describe, expect, it } from 'vitest';

import {
  KNOWN_HALLUCINATION_PHRASES,
  isKnownHallucinationPhrase,
  normalizeTranscript,
} from './transcript-quality';

describe('normalizeTranscript', () => {
  it('preserves Arabic diacritics exactly', () => {
    expect(normalizeTranscript('يُوسُف محمد')).toBe('يُوسُف محمد');
  });

  it('removes tatweel characters without stripping diacritics or letters', () => {
    expect(normalizeTranscript('يُــوسُـف')).toBe('يُوسُف');
    expect(normalizeTranscript('مـــرحبا')).toBe('مرحبا');
  });

  it('removes invisible directional characters', () => {
    expect(normalizeTranscript('\u200fمرحبا\u200e يا دكتور\ufeff')).toBe('مرحبا يا دكتور');
  });

  it('collapses repeated whitespace and trims surrounding whitespace', () => {
    expect(normalizeTranscript('  أريد   حجز\tموعد\n\nغداً  ')).toBe('أريد حجز موعد غداً');
  });

  it('preserves original scripts and punctuation in mixed-language transcripts', () => {
    expect(normalizeTranscript('أريد crown جديد، please')).toBe('أريد crown جديد، please');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeTranscript(' \n\t ')).toBe('');
  });
});

describe('isKnownHallucinationPhrase', () => {
  it('recognizes the documented Whisper hallucination phrase', () => {
    expect(isKnownHallucinationPhrase('Thanks for watching!')).toBe(true);
  });

  it('matches despite case, punctuation, and repeated whitespace differences', () => {
    expect(isKnownHallucinationPhrase('  THANKS   FOR WATCHING!!! ')).toBe(true);
  });

  it('does not flag a legitimate sentence containing a similar word', () => {
    expect(isKnownHallucinationPhrase('Thanks for watching the patient chart')).toBe(false);
  });

  it('does not flag a legitimate sentence with the phrase as a suffix', () => {
    expect(isKnownHallucinationPhrase('The doctor said thanks for watching')).toBe(false);
  });

  it('does not flag a normal dental-clinic sentence', () => {
    expect(isKnownHallucinationPhrase('أريد حجز موعد مع الدكتور يوسف')).toBe(false);
  });

  it('does not flag empty or whitespace-only input', () => {
    expect(isKnownHallucinationPhrase('   ')).toBe(false);
  });

  it('exposes known hallucination phrases for reuse by providers', () => {
    expect(KNOWN_HALLUCINATION_PHRASES).toContain('Thanks for watching!');
  });
});
