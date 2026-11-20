import {
  type SpeechToTextProvider,
  type SttTranscriptionResult,
} from '../../application/speech-to-text-provider';

export class MockSttProvider implements SpeechToTextProvider {
  public readonly name = 'mock' as const;

  public transcribe(): Promise<SttTranscriptionResult> {
    return Promise.resolve({ text: 'Mock transcription' });
  }
}
