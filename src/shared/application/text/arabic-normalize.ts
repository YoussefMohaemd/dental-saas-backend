const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeArabic(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
