import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@/lib/db';
import { addCard, cardKey, listCards, removeCard, setPile } from '@/lib/flashcards';
import { updateSettings, getSettings } from '@/lib/settings';
import { startGeneration } from '@/lib/generations';
import { startWorker, tick } from '@/lib/jobs/worker';
import { segmentClip, itemClip } from '@/lib/segment-audio';
import { cachePath, legacyCacheKey } from '@/lib/tts';
import { generationDir } from '@/lib/paths';
import { freshDb } from './helpers';

let db: ReturnType<typeof freshDb>;
beforeEach(() => {
  db = freshDb();
  updateSettings({ llm: { provider: 'mock' }, tts: { provider: 'mock' }, targetDurationMinutes: 8 });
  startWorker({});
});

describe('flashcards', () => {
  it('identifies the same item from vocabulary, grammar and transcript', () => {
    expect(cardKey({ kind: 'vocab', vocabId: 'v01-04', japanese: '私' })).toBe('vocab:v01-04');
    expect(cardKey({ kind: 'phrase', japanese: '私は学生です。' })).toBe(cardKey({ kind: 'phrase', japanese: '私は 学生です' }));
  });

  it('adds idempotently, moves between piles 1–4 and removes', () => {
    const a = addCard({ kind: 'vocab', vocabId: 'v01-04', japanese: '私', reading: 'わたし', romaji: 'watashi', english: 'I, me' });
    const again = addCard({ kind: 'vocab', vocabId: 'v01-04', japanese: '私', reading: '', romaji: '', english: 'I' });
    expect(again.id).toBe(a.id);
    expect(a.pile).toBe(1);
    expect(setPile(a.id, 2, true)!.pile).toBe(2);
    expect(setPile(a.id, 9)!.pile).toBe(4); // learned is the top
    expect(setPile(a.id, 0)!.pile).toBe(1);
    expect(listCards()[0].reviewCount).toBe(1);
    removeCard(a.id);
    expect(listCards()).toHaveLength(0);
  });
});

describe('per-phrase audio', () => {
  async function readyGeneration() {
    const { generationId } = await startGeneration('ja-beginner-01', {});
    for (let i = 0; i < 200; i++) {
      await tick();
      const g = db.select().from(schema.generations).where(eq(schema.generations.id, generationId)).get()!;
      if (g.status === 'ready') return g;
      if (g.status === 'failed') throw new Error(g.errorMessage ?? 'failed');
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('not ready');
  }

  it('finds the exact clip of a segment from the segment map', async () => {
    const g = await readyGeneration();
    expect(existsSync(path.join(generationDir(g.id), 'segments.json'))).toBe(true);
    const file = await segmentClip(g.id, 's01-01');
    expect(file && existsSync(file)).toBe(true);
    expect(await segmentClip(g.id, 'nope')).toBeNull();
  });

  it('falls back to the pre-Nov-18 cache key for older generations', async () => {
    const g = await readyGeneration();
    const settings = JSON.parse(g.configSnapshot);
    const seg = JSON.parse(g.scriptJson!).segments[0];
    const current = await segmentClip(g.id, seg.id);
    // simulate an old generation: no segment map, clip stored only under the legacy key
    rmSync(path.join(generationDir(g.id), 'segments.json'));
    const legacy = cachePath(legacyCacheKey({ name: 'mock', model: 'mock-tone-v1' }, seg, settings));
    mkdirSync(path.dirname(legacy), { recursive: true });
    copyFileSync(current!, legacy);
    rmSync(current!);
    expect(await segmentClip(g.id, seg.id)).toBe(legacy);
  });

  it('voices a vocabulary card with the current settings and caches it', async () => {
    const f1 = await itemClip({ japanese: '私', reading: 'わたし', kind: 'vocab' }, getSettings());
    const f2 = await itemClip({ japanese: '私', reading: 'わたし', kind: 'vocab' }, getSettings());
    expect(existsSync(f1)).toBe(true);
    expect(f2).toBe(f1);
  });
});
