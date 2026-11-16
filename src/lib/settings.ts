import { eq } from 'drizzle-orm';
import { getDb, schema } from './db';
import { SettingsSchema, defaultSettings, type Settings } from './config';

const KEY = 'app';

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return (patch ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    const b = out[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' ? deepMerge(b, v) : v;
  }
  return out as T;
}

export function getSettings(): Settings {
  const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  const base = defaultSettings();
  if (!row) return base;
  const parsed = SettingsSchema.safeParse(deepMerge(base, JSON.parse(row.valueJson)));
  return parsed.success ? parsed.data : base;
}

/** Validates a (partial) update server-side and persists the merged result. */
export function updateSettings(patch: unknown): Settings {
  const merged = SettingsSchema.parse(deepMerge(getSettings(), patch));
  if (merged.newVocabularyMin > merged.newVocabularyMax) throw new Error('newVocabularyMin must be ≤ newVocabularyMax');
  if (merged.dialogueTurnsMin > merged.dialogueTurnsMax) throw new Error('dialogueTurnsMin must be ≤ dialogueTurnsMax');
  const valueJson = JSON.stringify(merged);
  getDb()
    .insert(schema.settings)
    .values({ key: KEY, valueJson, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { valueJson, updatedAt: new Date() } })
    .run();
  return merged;
}
