export type SttLanguageHint = 'auto' | 'ar' | 'en' | 'mixed';

export interface SttSegmentQuality {
  start: number;
  end: number;
  avgLogprob?: number;
  noSpeechProb?: number;
  compressionRatio?: number;
  text?: string;
}

export interface SttTranscriptionResult {
  text: string;
  detectedLanguage?: string;
  confidence?: number;
  segments?: SttSegmentQuality[];
}

export interface SpeechToTextProvider {
  name: 'groq' | 'gemini' | 'mock';
  transcribe(input: {
    audio: Buffer;
    mimeType: string;
    languageHint?: SttLanguageHint;
    signal?: AbortSignal;
  }): Promise<SttTranscriptionResult>;
}
