'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KINDS, MODES, PILES, type KindId, type ModeId } from './modes';

type Counts = Record<KindId, Record<number, number>>;

/** Small section on the home page: pick a direction and content, then study. */
export function FlashcardLauncher({ counts }: { counts: Counts }) {
  const router = useRouter();
  const [mode, setMode] = useState<ModeId>('en-ja');
  const [kinds, setKinds] = useState<KindId[]>(['vocab', 'phrase']);
  const total = (p: number) => kinds.reduce((n, k) => n + (counts[k][p] ?? 0), 0);
  const active = total(1) + total(2) + total(3);
  const all = (['vocab', 'phrase'] as KindId[]).reduce((n, k) => n + [1, 2, 3, 4].reduce((m, p) => m + (counts[k][p] ?? 0), 0), 0);

  const start = () => router.push(`/flashcards?mode=${mode}&kinds=${kinds.join(',')}`);

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Flashcards</h2>
        <span className="text-sm text-muted">{all === 0 ? 'Add words and phrases from a lesson with the card icon' : `${all} cards`}</span>
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Direction</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {MODES.map((m) => (
              <label key={m.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${mode === m.id ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                <input type="radio" name="mode" checked={mode === m.id} onChange={() => setMode(m.id)} className="accent-[var(--accent)]" />
                <span className="ja">{m.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Cover</legend>
          <div className="flex flex-col gap-1.5">
            {KINDS.map((k) => (
              <label key={k.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={kinds.includes(k.id)}
                  onChange={(e) => setKinds(e.target.checked ? [...kinds, k.id] : kinds.filter((x) => x !== k.id))}
                />
                {k.label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-3 text-xs text-muted">
            {PILES.map((p) => <span key={p.id}>{p.label}: <b className="text-ink">{total(p.id)}</b></span>)}
          </div>
        </fieldset>
        <button className="btn-primary justify-center" disabled={kinds.length === 0 || active === 0} onClick={start}>
          Study {active > 0 ? `(${active})` : ''}
        </button>
      </div>
    </section>
  );
}
