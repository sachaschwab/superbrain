import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb, schema } from './db';
import { SettingsSchema, type Settings } from './config';
import { generationDir, TTS_CACHE_DIR } from './paths';
import { LessonScriptSchema, type AudioSegment } from './script/schema';
import { buildTtsRequest, buildTtsRequests, cacheKey, cachePath, createTtsProvider, legacyCacheKey, synthesizeCached } from './tts';
import { getSettings } from './settings';

const exists = (f: string) => access(f).then(() => true, () => false);

/**
 * The exact clip of one segment of a generation. Looks it up (segment map → current cache key →
 * pre-Nov-18 cache key) and only synthesises if it is genuinely missing.
 */
export async function segmentClip(generationId: string, segmentId: string): Promise<string | null> {
  const gen = getDb().select().from(schema.generations).where(eq(schema.generations.id, generationId)).get();
  if (!gen?.scriptJson) return null;
  const segs = LessonScriptSchema.parse(JSON.parse(gen.scriptJson)).segments;
  const i = segs.findIndex((s) => s.id === segmentId);
  if (i < 0) return null;

  try {
    const map = JSON.parse(await readFile(path.join(generationDir(generationId), 'segments.json'), 'utf8')) as Record<string, string>;
    const f = map[segmentId] && path.join(TTS_CACHE_DIR, map[segmentId]);
    if (f && (await exists(f))) return f;
  } catch {}

  const settings = SettingsSchema.parse(JSON.parse(gen.configSnapshot));
  const provider = { name: gen.ttsProvider ?? settings.tts.provider, model: gen.ttsModel ?? settings.tts.model };
  const current = cachePath(cacheKey(provider as never, buildTtsRequests(segs, settings)[i]));
  if (await exists(current)) return current;
  const legacy = cachePath(legacyCacheKey(provider, segs[i], settings));
  if (await exists(legacy)) return legacy;

  const tts = createTtsProvider(settings);
  return (await synthesizeCached(tts, buildTtsRequests(segs, settings)[i])).file;
}

/** Audio for a free-standing Japanese item (vocabulary or example sentence), with the current voices. */
export async function itemClip(item: { japanese: string; reading: string; kind: 'vocab' | 'phrase' }, settings: Settings = getSettings()) {
  const seg: AudioSegment = {
    id: 'item', stepNumber: 3, speaker: 'female', language: 'ja-JP', text: item.japanese,
    speechRate: item.kind === 'vocab' ? 'slow' : 'medium', pauseAfterMs: 0, pronunciationNotes: '',
    transcript: { reading: item.reading, romaji: '', translation: '', structuralTranslation: '', grammarNote: '' },
  };
  return (await synthesizeCached(createTtsProvider(settings), buildTtsRequest(seg, settings))).file;
}

export { buildTtsRequest };
