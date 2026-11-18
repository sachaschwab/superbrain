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

/**
 * Voice delivery per speech rate. "natural" sits slightly under 1.0: isolated TTS turns at full
 * speed sound hurried to learners. Step 9 ("medium") is ~90% of that, as the spec asks.
 */
const DELIVERY: Record<SpeechRate, { speed: number; stability: number }> = {
  slow: { speed: 0.8, stability: 0.6 },
  medium: { speed: 0.87, stability: 0.55 },
  natural: { speed: 0.95, stability: 0.5 },
  gentle: { speed: 0.85, stability: 0.7 },
};

export function voiceFor(seg: Pick<AudioSegment, 'speaker' | 'language'>, settings: Settings): string {
  const v = settings.voices;
  if (seg.speaker === 'female') return v.female;
  if (seg.speaker === 'male') return v.male;
  // Narrator: English guide voice; Japanese examples go to a native-sounding voice.
  return seg.language === 'ja-JP' ? v.narratorJapanese || v.female : v.narrator;
}

const KANA_ONLY = /^[\u3040-\u30ffー・、。！？\s]+$/;
const strip = (s: string) => s.replace(/[\s、。！？!?「」…・〜]/g, '');

/**
 * Text actually sent to the voice. Single Japanese words heard on their own (vocabulary drills)
 * are sent as their kana reading: kanji like 私 or 日本 have several readings, and a lone word
 * gives the model too little context to sound Japanese. The transcript keeps the kanji.
 */
export function speechText(seg: AudioSegment): string {
  if (seg.language !== 'ja-JP') return seg.text.replace(/\s*\/\s*/g, ' or ');
  const reading = seg.transcript.reading.trim();
  const core = strip(seg.text);
  // Single words only: ≤4 characters, containing kanji, and no は/へ that could be particles (read wa/e).
  if (core.length <= 4 && /[\u4e00-\u9fff]/.test(core) && !/[はへ]/.test(core) && reading && KANA_ONLY.test(reading)) {
    return /[。！？?!]$/.test(reading) ? reading : `${reading}。`;
  }
  return seg.text;
}

/** Fallback context for a Japanese segment with no Japanese neighbour (helps models without language_code). */
const JA_CONTEXT = '日本語の言葉です。';

export function buildTtsRequest(seg: AudioSegment, settings: Settings, neighbours: { prev?: AudioSegment; next?: AudioSegment } = {}): TtsRequest {
  const d = DELIVERY[seg.speechRate];
  const speed = Math.min(1.2, Math.max(0.7, +(d.speed * settings.speechSpeed).toFixed(3)));
  const sameLang = (n?: AudioSegment) => (n && n.language === seg.language && n.stepNumber === seg.stepNumber ? speechText(n) : undefined);
  const previousText = sameLang(neighbours.prev) ?? (seg.language === 'ja-JP' ? JA_CONTEXT : undefined);
  const nextText = sameLang(neighbours.next);
  return {
    text: speechText(seg),
    voiceId: voiceFor(seg, settings),
    language: seg.language,
    speechRate: seg.speechRate,
    speed,
    stability: d.stability,
    ...(previousText ? { previousText } : {}),
    ...(nextText ? { nextText } : {}),
  };
}

/** Requests for a whole script, each with its neighbours as context. */
export function buildTtsRequests(segs: AudioSegment[], settings: Settings): TtsRequest[] {
  return segs.map((s, i) => buildTtsRequest(s, settings, { prev: segs[i - 1], next: segs[i + 1] }));
}

export function cacheKey(provider: TtsProvider, req: TtsRequest) {
  return createHash('sha256')
    .update(JSON.stringify([provider.name, provider.model, req.voiceId, req.speed, req.stability, req.language, req.text, req.previousText ?? '', req.nextText ?? '']))
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

