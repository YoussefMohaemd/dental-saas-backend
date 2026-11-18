export interface SpeechToTextProvider {
  name: 'groq' | 'gemini' | 'mock';
  transcribe(input: {
    audio: Buffer;
    mimeType: string;
    languageHint?: string;
    signal?: AbortSignal;
  }): Promise<{ text: string }>;
}
