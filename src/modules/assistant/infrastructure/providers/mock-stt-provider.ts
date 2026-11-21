import {
  type SpeechToTextProvider,
  type SttRequest,
  type SttResult,
} from '../../application/speech-to-text-provider';

export class MockSttProvider implements SpeechToTextProvider {
  public readonly name = 'mock' as const;

  public transcribe(input: SttRequest): Promise<SttResult> {
    void input;
    return Promise.resolve({ text: 'Mock transcription' });
  }
}
