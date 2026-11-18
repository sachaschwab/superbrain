import type { SpeechRate } from '../script/schema';

export type TtsRequest = {
  /** Exactly what is sent for synthesis (may be the kana reading of a short Japanese word). */
  text: string;
  voiceId: string;
  language: 'ja-JP' | 'en';
  speechRate: SpeechRate;
  /** Already includes the global speed multiplier, clamped to 0.7–1.2. */
  speed: number;
  stability: number;
  /** Not spoken: neighbouring text that helps prosody and keeps the model in the right language. */
  previousText?: string;
  nextText?: string;
};

export interface TtsProvider {
  readonly name: string;
  readonly model: string;
  /** Returns MP3 bytes. Throws TransientError for retryable failures. */
  synthesize(req: TtsRequest): Promise<Buffer>;
}
