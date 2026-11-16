import type { SpeechRate } from '../script/schema';

export type TtsRequest = {
  text: string;
  voiceId: string;
  language: 'ja-JP' | 'en';
  speechRate: SpeechRate;
  /** Already includes the global speed multiplier, clamped to the provider's range. */
  speed: number;
  stability: number;
};

export interface TtsProvider {
  readonly name: string;
  readonly model: string;
  /** Returns MP3 bytes. Throws TransientError for retryable failures. */
  synthesize(req: TtsRequest): Promise<Buffer>;
}
