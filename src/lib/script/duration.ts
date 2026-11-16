import type { AudioSegment, SpeechRate } from './schema';

export const RATE_FACTOR: Record<SpeechRate, number> = { slow: 0.8, medium: 0.92, natural: 1, gentle: 0.88 };

const KANA = /[぀-ヿ]/g;
const KANJI = /[一-鿿㐀-䶿]/g;
const LATIN_DIGIT = /[A-Za-z0-9]/g;

/** Rough mora count: kana ≈ 1, kanji ≈ 1.8 (most readings are 1–3 morae). */
export function estimateMorae(text: string): number {
  const kana = text.match(KANA)?.length ?? 0;
  const kanji = text.match(KANJI)?.length ?? 0;
  const latin = text.match(LATIN_DIGIT)?.length ?? 0;
  return kana + kanji * 1.8 + latin * 0.8;
}

/** Estimated spoken seconds for one segment, excluding the pause. */
export function estimateSpeechSeconds(seg: Pick<AudioSegment, 'language' | 'text' | 'speechRate'>, speed = 1): number {
  const factor = RATE_FACTOR[seg.speechRate] * speed;
  if (seg.language === 'ja-JP') return estimateMorae(seg.text) / (7 * factor) + 0.3; // ~7 morae/s natural
  const words = seg.text.trim().split(/\s+/).filter(Boolean).length;
  return words / (2.6 * factor) + 0.3; // ~155 wpm
}

export function estimateSegmentSeconds(seg: AudioSegment, speed = 1) {
  return estimateSpeechSeconds(seg, speed) + seg.pauseAfterMs / 1000;
}

export function estimateScriptSeconds(segments: AudioSegment[], speed = 1) {
  const perStep: Record<number, number> = {};
  let total = 0;
  for (const s of segments) {
    const sec = estimateSegmentSeconds(s, speed);
    perStep[s.stepNumber] = (perStep[s.stepNumber] ?? 0) + sec;
    total += sec;
  }
  return { total, perStep };
}
