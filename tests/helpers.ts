import { rmSync } from 'node:fs';
import { DATA_DIR } from '@/lib/paths';
import { closeDb, getDb } from '@/lib/db';
import { SettingsSchema, type Settings } from '@/lib/config';

export function freshDb() {
  closeDb();
  rmSync(DATA_DIR, { recursive: true, force: true });
  return getDb();
}

export function mockSettings(patch: Partial<Settings> = {}): Settings {
  return SettingsSchema.parse({ llm: { provider: 'mock' }, tts: { provider: 'mock' }, ...patch });
}
