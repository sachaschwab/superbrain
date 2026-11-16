import path from 'node:path';

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(process.cwd(), 'data'));
export const DB_PATH = path.join(DATA_DIR, 'superbrain.db');
export const GENERATIONS_DIR = path.join(DATA_DIR, 'generations');
export const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
export const CURRICULUM_PATH = path.join(process.cwd(), 'data', 'curriculum', 'japanese-beginner.json');
export const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

export const generationDir = (generationId: string) => path.join(GENERATIONS_DIR, generationId);
