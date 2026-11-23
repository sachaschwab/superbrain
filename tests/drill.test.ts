import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { addCard, listCards, setPile } from '@/lib/flashcards';
import { updateSettings } from '@/lib/settings';
import { buildDrill, drillFile, DRILL_PLAN, scheduleDrill, thinkMs } from '@/lib/drill';
import { probeDuration } from '@/lib/audio/ffmpeg';
import { freshDb } from './helpers';

const card = (id: string, pile: number, kind: 'vocab' | 'phrase' = 'vocab') => ({ id, pile, kind, japanese: '私は学生です', english: id });
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('drill schedule', () => {
  const cards = [...Array(8)].map((_, i) => card(`a${i}`, 1)).concat([...Array(6)].map((_, i) => card(`b${i}`, 2)), [...Array(5)].map((_, i) => card(`c${i}`, 3)), [card('d0', 4)]);
  const order = scheduleDrill(cards, seeded());

  it('plays each card as often as its pile says', () => {
    for (const c of cards) expect(order.filter((x) => x.id === c.id)).toHaveLength(DRILL_PLAN[c.pile].reps);
  });

  it('never plays a card twice in a row', () => {
    for (let i = 1; i < order.length; i++) expect(order[i].id).not.toBe(order[i - 1].id);
  });

  it('spreads repeats with widening gaps for pile 1', () => {
    const gaps = cards.filter((c) => c.pile === 1).map((c) => {
      const at = order.flatMap((x, i) => (x.id === c.id ? [i] : []));
      return at.slice(1).map((p, i) => p - at[i]);
    });
    const avg = (k: number) => gaps.reduce((s, g) => s + g[k], 0) / gaps.length;
    expect(avg(0)).toBeGreaterThanOrEqual(3);
    expect(avg(1)).toBeGreaterThan(avg(0));
    expect(avg(2)).toBeGreaterThan(avg(1));
  });

  it('handles a single card', () => {
    expect(scheduleDrill([card('x', 1)]).map((c) => c.id)).toEqual(['x', 'x', 'x', 'x']);
  });

  it('gives phrases more thinking time than words, capped', () => {
    expect(thinkMs({ kind: 'vocab', japanese: '私' })).toBe(3000);
    expect(thinkMs({ kind: 'phrase', japanese: '私は学生です' })).toBeGreaterThan(3000);
    expect(thinkMs({ kind: 'phrase', japanese: 'あ'.repeat(200) })).toBe(7000);
  });
});

describe('drill audio', () => {
  beforeEach(() => {
    freshDb();
    updateSettings({ llm: { provider: 'mock' }, tts: { provider: 'mock' } });
  });

  it('builds one MP3 from the selected cards', async () => {
    const a = addCard({ kind: 'vocab', vocabId: 'v01-04', japanese: '私', reading: 'わたし', romaji: 'watashi', english: 'I, me' });
    const b = addCard({ kind: 'phrase', japanese: '私は学生です。', reading: '', romaji: 'watashi wa gakusei desu', english: 'I am a student.' });
    setPile(b.id, 3);
    const drill = await buildDrill(listCards());
    expect(drill.plays).toBe(4 + 2);
    expect(existsSync(drillFile(drill.id))).toBe(true);
    // 6 prompts with ≥3 s thinking and ≥2 s after each answer
    expect(await probeDuration(drillFile(drill.id))).toBeGreaterThan(6 * 5);
    expect(a.pile).toBe(1);
  }, 60_000);
});
