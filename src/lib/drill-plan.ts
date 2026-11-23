import type { Flashcard } from './flashcards';
import { estimateSpeechSeconds } from './script/duration';

// Client-safe: no Node imports, so the Flashcards page can show the expected length.

/**
 * How often a card is heard in one drill, and the gaps (in items heard in between) before each
 * repeat. Weaker piles come back more often and sooner; the gaps widen each time, which is what
 * makes spaced recall stick better than hearing a card several times in a row.
 */
export const DRILL_PLAN: Record<number, { reps: number; gaps: number[] }> = {
  1: { reps: 4, gaps: [3, 7, 15] },
  2: { reps: 3, gaps: [5, 12] },
  3: { reps: 2, gaps: [10] },
  4: { reps: 1, gaps: [] },
};

export type DrillCard = Pick<Flashcard, 'id' | 'pile' | 'kind' | 'japanese' | 'english'>;

/**
 * Order of plays. Repeats that are due come first; otherwise the next new card is introduced.
 * Never plays the same card twice in a row while another card is available.
 */
export function scheduleDrill<C extends DrillCard>(cards: C[], random: () => number = Math.random): C[] {
  const fresh = [...cards];
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
  }
  const due: { card: C; at: number; rep: number }[] = [];
  const out: C[] = [];
  const play = (card: C, rep: number) => {
    out.push(card);
    const plan = DRILL_PLAN[card.pile] ?? DRILL_PLAN[1];
    if (rep + 1 < plan.reps) due.push({ card, at: out.length + plan.gaps[rep], rep: rep + 1 });
  };
  while (fresh.length || due.length) {
    due.sort((a, b) => a.at - b.at);
    const last = out.at(-1);
    const ready = due.findIndex((d) => d.at <= out.length && d.card !== last);
    if (ready >= 0) {
      const [d] = due.splice(ready, 1);
      play(d.card, d.rep);
    } else if (fresh.length) {
      play(fresh.shift()!, 0);
    } else {
      // Only repeats left and none due yet: take the earliest, avoiding a back-to-back repeat if possible.
      const i = Math.max(0, due.findIndex((d) => d.card !== last));
      const [d] = due.splice(i, 1);
      play(d.card, d.rep);
    }
  }
  return out;
}

/** Thinking time after the English prompt: longer phrases need longer to build. */
export function thinkMs(card: Pick<DrillCard, 'kind' | 'japanese'>) {
  if (card.kind === 'vocab') return 3000;
  const speech = estimateSpeechSeconds({ language: 'ja-JP', text: card.japanese, speechRate: 'medium' });
  return Math.round(Math.min(7000, 4000 + speech * 1000) / 100) * 100;
}
/** Gap after the Japanese answer before the next prompt. */
export const AFTER_ANSWER_MS = { vocab: 2000, phrase: 2500 } as const;

/** Rough length in seconds, for the button label (without synthesising anything). */
export function estimateDrillSeconds(cards: DrillCard[]) {
  let s = 1;
  for (const c of cards) {
    const reps = (DRILL_PLAN[c.pile] ?? DRILL_PLAN[1]).reps;
    const one =
      estimateSpeechSeconds({ language: 'en', text: c.english, speechRate: 'medium' }) +
      estimateSpeechSeconds({ language: 'ja-JP', text: c.japanese, speechRate: c.kind === 'vocab' ? 'slow' : 'medium' }) +
      (thinkMs(c) + AFTER_ANSWER_MS[c.kind]) / 1000;
    s += reps * one;
  }
  return s;
}
