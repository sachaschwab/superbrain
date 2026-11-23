'use client';

import { useMemo, useState } from 'react';
import type { Flashcard } from '@/lib/flashcards';
import { DRILL_PLAN, estimateDrillSeconds } from '@/lib/drill-plan';
import { AudioPlayer } from '../AudioPlayer';
import { PILES, type KindId } from './modes';

type Drill = { id: string; duration: number; cards: number; plays: number };

const minutes = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n}×`);

/** Builds one listening file from the selected cards: English → pause to think → Japanese once. */
export function DrillPanel({ cards, kinds }: { cards: Flashcard[]; kinds: KindId[] }) {
  const [piles, setPiles] = useState<number[]>([1, 2, 3]);
  const [state, setState] = useState<'idle' | 'building' | 'error'>('idle');
  const [error, setError] = useState('');
  const [drill, setDrill] = useState<Drill | null>(null);

  const selected = useMemo(() => cards.filter((c) => kinds.includes(c.kind) && piles.includes(c.pile)), [cards, kinds, piles]);
  const estimate = useMemo(() => estimateDrillSeconds(selected), [selected]);
  const count = (p: number) => cards.filter((c) => kinds.includes(c.kind) && c.pile === p).length;

  const build = async () => {
    setState('building');
    setError('');
    try {
      const res = await fetch('/api/flashcards/drill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kinds, piles }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
      setDrill(body);
      setState('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Audio drill</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            English, a pause to think, then the Japanese once. Cards come back with widening gaps:
            {' '}{PILES.filter((p) => piles.includes(p.id)).map((p) => `${p.label} ${times(DRILL_PLAN[p.id].reps)}`).join(', ') || 'no piles selected'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {PILES.map((p) => (
            <label key={p.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="accent-[var(--accent)]" checked={piles.includes(p.id)}
                onChange={(e) => setPiles(e.target.checked ? [...piles, p.id].sort() : piles.filter((x) => x !== p.id))} />
              {p.label} <span className="text-muted">{count(p.id)}</span>
            </label>
          ))}
          <button className="btn-primary" disabled={!selected.length || state === 'building'} onClick={build}>
            {state === 'building' ? 'Making audio…' : `Make audio drill${selected.length ? ` · ${selected.length} cards · ~${minutes(estimate)}` : ''}`}
          </button>
        </div>
      </div>
      {state === 'building' && (
        <p className="mt-3 text-sm text-muted">Voicing any new clips and assembling the file. Clips already made are reused, so this is quick the second time.</p>
      )}
      {state === 'error' && <p className="mt-3 text-sm text-bad">{error}</p>}
      {drill && state !== 'building' && (
        <div className="mt-4 space-y-3">
          <AudioPlayer key={drill.id} src={`/api/flashcards/drill/${drill.id}`} knownDuration={drill.duration} />
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>{drill.cards} cards · {drill.plays} prompts · {minutes(drill.duration)}</span>
            <a href={`/api/flashcards/drill/${drill.id}?download=1`} className="btn">Download MP3</a>
          </div>
        </div>
      )}
    </section>
  );
}
