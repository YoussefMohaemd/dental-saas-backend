export type VoiceLanguage = 'auto' | 'ar' | 'en' | 'mixed';

export interface SttSegment {
  start: number;
  end: number;
  text: string;
  avgLogprob?: number;
  noSpeechProb?: number;
  compressionRatio?: number;
}

export interface SttResult {
  text: string;
  language?: string;
  confidence?: number;
  segments?: SttSegment[];
}

export interface SttRequest {
  audio: Buffer;
  mimeType: string;
  language: VoiceLanguage;
  vocabulary: string[];
  signal?: AbortSignal;
}

export interface SpeechToTextProvider {
  name: 'groq' | 'gemini' | 'mock';
  transcribe(input: SttRequest): Promise<SttResult>;
}

/**
 * @deprecated Use {@link VoiceLanguage}.
 * Retained only for the Task 0 STT evaluation harness in `scripts/stt-eval`,
 * which must not be modified by the provider-contract task.
 */
export type SttLanguageHint = VoiceLanguage;
