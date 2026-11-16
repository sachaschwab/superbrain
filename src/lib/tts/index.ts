import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { Settings } from '../config';
import type { AudioSegment, SpeechRate } from '../script/schema';
import { TTS_CACHE_DIR } from '../paths';
import { withRetry } from '../retry';
import { ElevenLabsProvider } from './elevenlabs';
import { MockTtsProvider } from './mock';
import type { TtsProvider, TtsRequest } from './types';

export * from './types';

export function createTtsProvider(settings: Settings): TtsProvider {
  if (settings.tts.provider === 'mock') return new MockTtsProvider();
  return new ElevenLabsProvider(settings.tts.model);
}

/** Voice delivery per speech rate. Speed range for ElevenLabs is 0.7–1.2. */
const DELIVERY: Record<SpeechRate, { speed: number; stability: number }> = {
  slow: { speed: 0.8, stability: 0.6 },
  medium: { speed: 0.92, stability: 0.55 },
  natural: { speed: 1.0, stability: 0.5 },
  gentle: { speed: 0.88, stability: 0.7 },
};

export function voiceFor(seg: Pick<AudioSegment, 'speaker' | 'language'>, settings: Settings): string {
  const v = settings.voices;
  if (seg.speaker === 'female') return v.female;
  if (seg.speaker === 'male') return v.male;
  // Narrator: English guide voice; Japanese examples go to a native-sounding voice.
  return seg.language === 'ja-JP' ? v.narratorJapanese || v.female : v.narrator;
}

export function buildTtsRequest(seg: AudioSegment, settings: Settings): TtsRequest {
  const d = DELIVERY[seg.speechRate];
  const speed = Math.min(1.2, Math.max(0.7, +(d.speed * settings.speechSpeed).toFixed(3)));
  return { text: seg.text, voiceId: voiceFor(seg, settings), language: seg.language, speechRate: seg.speechRate, speed, stability: d.stability };
}

export function cacheKey(provider: TtsProvider, req: TtsRequest) {
  return createHash('sha256')
    .update(JSON.stringify([provider.name, provider.model, req.voiceId, req.speed, req.stability, req.text]))
    .digest('hex')
    .slice(0, 32);
}

export const cachePath = (key: string) => path.join(TTS_CACHE_DIR, `${key}.mp3`);

const inFlight = new Map<string, Promise<{ file: string; cached: boolean; characters: number }>>();

/** Synthesize with an on-disk cache; repeated segments (and resumed jobs) cost nothing. */
export function synthesizeCached(provider: TtsProvider, req: TtsRequest, onRetry?: (err: unknown, attempt: number) => void) {
  const key = cacheKey(provider, req);
  const file = cachePath(key);
  // Identical segments requested concurrently share one API call.
  const pending = inFlight.get(key);
  if (pending) return pending.then((r) => ({ ...r, cached: true, characters: 0 }));
  const p = (async () => {
    try {
      await access(file);
      return { file, cached: true, characters: 0 };
    } catch {}
    const audio = await withRetry(() => provider.synthesize(req), { attempts: 4, baseMs: 1500, onRetry });
    await mkdir(TTS_CACHE_DIR, { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, audio);
    await rename(tmp, file);
    return { file, cached: false, characters: req.text.length };
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

export async function isCached(provider: TtsProvider, req: TtsRequest) {
  try {
    await access(cachePath(cacheKey(provider, req)));
    return true;
  } catch {
    return false;
  }
}

