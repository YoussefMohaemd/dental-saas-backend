/**
 * Safe transcript normalization and hallucination detection for production
 * speech-to-text output.
 *
 * Normalization must never change what the user said. It only removes
 * non-spoken artifacts: tatweel, invisible directional characters, and
 * repeated whitespace. Arabic diacritics and original scripts are preserved.
 *
 * Evaluation-only normalization lives in `scripts/stt-eval/wer.ts` and is
 * deliberately different: it strips diacritics and punctuation so that WER/CER
 * comparisons ignore orthographic variations.
 */

const ARABIC_TATWEEL_PATTERN = /\u0640/g;
const INVISIBLE_DIRECTIONAL_PATTERN = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const WHITESPACE_PATTERN = /\s+/g;
const PUNCTUATION_AND_SYMBOL_PATTERN = /[\p{P}\p{S}]/gu;

/**
 * Whisper-style phrases that are commonly emitted for silence or background
 * noise rather than speech. Keep this list modest and only add phrases known
 * to be generated without any spoken input.
 */
export const KNOWN_HALLUCINATION_PHRASES: readonly string[] = [
  'Thanks for watching!',
  'Thank you for watching',
  'Please subscribe to the channel',
  'Subscribe to the channel',
];

export function normalizeTranscript(value: string): string {
  return value
    .replace(INVISIBLE_DIRECTIONAL_PATTERN, '')
    .replace(ARABIC_TATWEEL_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
}

function normalizeForPhraseMatching(value: string): string {
  return normalizeTranscript(value)
    .toLowerCase()
    .replace(PUNCTUATION_AND_SYMBOL_PATTERN, ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
}

const NORMALIZED_HALLUCINATION_PHRASES = new Set(
  KNOWN_HALLUCINATION_PHRASES.map(normalizeForPhraseMatching),
);

/**
 * Returns true only when the whole transcript is a known hallucination phrase
 * after normalization. Comparison is exact-phrase based, never substring
 * based, so legitimate sentences that merely contain similar words are kept.
 */
export function isKnownHallucinationPhrase(value: string): boolean {
  const normalized = normalizeForPhraseMatching(value);
  if (normalized.length === 0) {
    return false;
  }
  return NORMALIZED_HALLUCINATION_PHRASES.has(normalized);
}
