import { type SpeechToTextProvider } from '../../application/speech-to-text-provider';

export class MockSttProvider implements SpeechToTextProvider {
  public readonly name = 'mock' as const;

  public transcribe(): Promise<{ text: string }> {
    return Promise.resolve({ text: 'Mock transcription' });
  }
}
