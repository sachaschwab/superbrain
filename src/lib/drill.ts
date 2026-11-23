import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Settings } from './config';
import type { Flashcard } from './flashcards';
export * from './drill-plan';
import { DATA_DIR } from './paths';
import { getSettings } from './settings';
import { assembleLesson, type AssemblyItem } from './audio/assemble';
import { itemClip, segmentClip } from './segment-audio';
import { buildTtsRequest, createTtsProvider, synthesizeCached } from './tts';
import { AFTER_ANSWER_MS, scheduleDrill, thinkMs } from './drill-plan';
import type { AudioSegment } from './script/schema';

export const DRILLS_DIR = path.join(DATA_DIR, 'drills');

/** The English prompt, in the narrator voice; synthesised once and cached like every other clip. */
async function englishClip(text: string, settings: Settings) {
  const seg: AudioSegment = {
    id: 'drill-en', stepNumber: 0, speaker: 'narrator', language: 'en', text, speechRate: 'medium', pauseAfterMs: 0, pronunciationNotes: '',
    transcript: { reading: '', romaji: '', translation: '', structuralTranslation: '', grammarNote: '' },
  };
  return (await synthesizeCached(createTtsProvider(settings), buildTtsRequest(seg, settings))).file;
}

const japaneseClip = async (c: Flashcard, settings: Settings) =>
  (c.generationId && c.segmentId && (await segmentClip(c.generationId, c.segmentId))) || (await itemClip(c, settings));

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

export const drillFile = (id: string) => path.join(DRILLS_DIR, `${id}.mp3`);
export const isDrillId = (id: string) => /^[a-f0-9]{16}$/.test(id);
const KEEP_DRILLS = 5;

/** Builds the drill MP3: English → thinking pause → Japanese once, in the spaced order above. */
export async function buildDrill(cards: Flashcard[], settings: Settings = getSettings()) {
  if (!cards.length) throw new Error('No cards selected');
  const order = scheduleDrill(cards);

  const clips = new Map<string, { en: string; ja: string }>();
  await mapLimit(cards, 4, async (c) => {
    clips.set(c.id, { en: await englishClip(c.english, settings), ja: await japaneseClip(c, settings) });
  });

  const items: AssemblyItem[] = order.flatMap((c) => [
    { file: clips.get(c.id)!.en, pauseAfterMs: thinkMs(c) },
    { file: clips.get(c.id)!.ja, pauseAfterMs: AFTER_ANSWER_MS[c.kind] },
  ]);

  const id = createHash('sha256').update(JSON.stringify([Date.now(), items])).digest('hex').slice(0, 16);
  await mkdir(DRILLS_DIR, { recursive: true });
  const { duration } = await assembleLesson(items, drillFile(id), path.join(DRILLS_DIR, `work-${id}`));
  await pruneDrills();
  return { id, duration, cards: cards.length, plays: order.length };
}

/** Keeps the most recent drills only; each is a few MB to a few tens of MB. */
async function pruneDrills() {
  const files = (await readdir(DRILLS_DIR)).filter((f) => f.endsWith('.mp3'));
  const dated = await Promise.all(files.map(async (f) => ({ f, t: (await stat(path.join(DRILLS_DIR, f))).mtimeMs })));
  dated.sort((a, b) => b.t - a.t);
  await Promise.all(dated.slice(KEEP_DRILLS).map(({ f }) => rm(path.join(DRILLS_DIR, f), { force: true })));
}
