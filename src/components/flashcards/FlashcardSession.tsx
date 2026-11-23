'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Flashcard } from '@/lib/flashcards';
import { PlayButton } from '../PlayButton';
import { DrillPanel } from './DrillPanel';
import { KINDS, MODES, PILES, type KindId, type ModeId } from './modes';

const shuffle = <T,>(a: T[]) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

type Props = { initialCards: Flashcard[]; initialMode: ModeId; initialKinds: KindId[] };

export function FlashcardSession({ initialCards, initialMode, initialKinds }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [mode, setMode] = useState<ModeId>(initialMode);
  const [kinds, setKinds] = useState<KindId[]>(initialKinds);
  const inScope = useCallback((c: Flashcard) => kinds.includes(c.kind), [kinds]);
  const countIn = (p: number) => cards.filter((c) => inScope(c) && c.pile === p).length;
  const firstPile = [1, 2, 3].find((p) => countIn(p) > 0) ?? 1;
  const [pile, setPile] = useState<number>(firstPile);

  // The deck for this round is fixed when the round starts, so cards moving piles don't reshuffle it.
  const [deck, setDeck] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ up: 0, down: 0 });

  const startRound = useCallback(
    (p = pile) => {
      setDeck(shuffle(cards.filter((c) => inScope(c) && c.pile === p).map((c) => c.id)));
      setIndex(0);
      setFlipped(false);
      setStats({ up: 0, down: 0 });
    },
    [cards, inScope, pile]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => startRound(pile), [pile, kinds.join()]);

  const card = cards.find((c) => c.id === deck[index]);
  const done = deck.length > 0 && index >= deck.length;

  const move = useCallback(async (c: Flashcard, to: number, reviewed: boolean) => {
    const target = Math.min(4, Math.max(1, to));
    setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, pile: target } : x)));
    await fetch(`/api/flashcards/${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pile: target, reviewed }) });
  }, []);

  const answer = useCallback(
    (knew: boolean) => {
      if (!card) return;
      void move(card, knew ? card.pile + 1 : card.pile - 1, true);
      setStats((s) => (knew ? { ...s, up: s.up + 1 } : { ...s, down: s.down + 1 }));
      setFlipped(false);
      setIndex((i) => i + 1);
    },
    [card, move]
  );

  const remove = async (c: Flashcard) => {
    if (!confirm(`Remove "${c.japanese}" from your flashcards?`)) return;
    setCards((cs) => cs.filter((x) => x.id !== c.id));
    await fetch(`/api/flashcards/${c.id}`, { method: 'DELETE' });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || !card) return;
      if (e.key === ' ') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && e.key === 'ArrowRight') answer(true);
      else if (flipped && e.key === 'ArrowLeft') answer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, flipped, answer]);

  const scoped = useMemo(() => cards.filter(inScope), [cards, inScope]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Flashcards</h1>
          <p className="mt-1 text-sm text-muted">“Knew it” moves a card up one pile; after Pile 3 it is learned. “Not yet” moves it back one pile.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select className="field w-auto" value={mode} onChange={(e) => { setMode(e.target.value as ModeId); setFlipped(false); }}>
            {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {KINDS.map((k) => (
            <label key={k.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="accent-[var(--accent)]" checked={kinds.includes(k.id)}
                onChange={(e) => setKinds(e.target.checked ? [...kinds, k.id] : kinds.filter((x) => x !== k.id))} />
              {k.label}
            </label>
          ))}
        </div>
      </div>

      {/* Pile tabs */}
      <div className="flex flex-wrap gap-2">
        {PILES.map((p) => (
          <button key={p.id} onClick={() => setPile(p.id)}
            className={`rounded-lg border px-4 py-2 text-sm ${pile === p.id ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line bg-surface hover:border-accent'}`}>
            {p.label} <span className="ml-1 text-muted">{countIn(p.id)}</span>
          </button>
        ))}
      </div>

      {/* Card */}
      <section className="mx-auto max-w-xl">
        {deck.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
            No cards in {PILES.find((p) => p.id === pile)?.label} for this selection.
          </div>
        ) : done ? (
          <div className="rounded-2xl border border-line bg-surface p-10 text-center">
            <div className="text-lg font-semibold">Round finished</div>
            <p className="mt-1 text-sm text-muted">{stats.up} moved up · {stats.down} moved back</p>
            <button className="btn-primary mt-5" onClick={() => startRound()}>Study {PILES.find((p) => p.id === pile)?.label} again ({countIn(pile)})</button>
          </div>
        ) : card ? (
          <>
            <div className="mb-2 flex justify-between text-xs text-muted">
              <span>{index + 1} / {deck.length}</span>
              <span>{card.kind === 'vocab' ? 'Vocabulary' : 'Phrase'} · {PILES.find((p) => p.id === card.pile)?.label}</span>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setFlipped((f) => !f)}
              className="flex min-h-72 w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border border-line bg-surface p-8 text-center shadow-sm transition-colors hover:border-accent focus:border-accent focus:outline-none"
            >
              {!flipped ? <Front card={card} mode={mode} /> : <Back card={card} mode={mode} />}
              <span className="text-xs text-muted">{flipped ? '' : 'Click or press space to reveal'}</span>
            </div>
            <div className="mt-4 flex justify-center gap-3">
              {flipped ? (
                <>
                  <button className="btn px-5" onClick={() => answer(false)}>← Not yet{card.pile > 1 ? ` (to Pile ${card.pile - 1})` : ''}</button>
                  <button className="btn-primary px-5" onClick={() => answer(true)}>Knew it → {card.pile >= 3 ? 'Learned' : `Pile ${card.pile + 1}`}</button>
                </>
              ) : (
                <button className="btn px-5" onClick={() => setFlipped(true)}>Show answer</button>
              )}
            </div>
          </>
        ) : null}
      </section>

      <DrillPanel cards={cards} kinds={kinds} />

      {/* Piles overview with manual moves */}
      <details className="rounded-xl border border-line bg-surface p-5" open={scoped.length > 0 && scoped.length <= 40}>
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wider text-muted">All cards ({scoped.length})</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {PILES.map((p) => (
            <div key={p.id}>
              <h3 className="mb-2 text-sm font-medium">{p.label} <span className="text-muted">{countIn(p.id)}</span></h3>
              <ul className="space-y-1.5">
                {scoped.filter((c) => c.pile === p.id).map((c) => (
                  <li key={c.id} className="group flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-sm">
                    <button className="px-1 text-muted hover:text-accent disabled:invisible" disabled={c.pile === 1} onClick={() => move(c, c.pile - 1, false)} title="Move back a pile">‹</button>
                    <div className="min-w-0 flex-1">
                      <div className="ja truncate">{c.japanese}</div>
                      <div className="truncate text-xs text-muted">{c.english}</div>
                    </div>
                    <button className="px-1 text-muted hover:text-accent disabled:invisible" disabled={c.pile === 4} onClick={() => move(c, c.pile + 1, false)} title="Move up a pile">›</button>
                    <button className="px-1 text-muted opacity-0 hover:text-bad group-hover:opacity-100" onClick={() => remove(c)} title="Remove from flashcards">✕</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

const audioSrc = (c: Flashcard) => `/api/flashcards/${c.id}/audio`;

function Japanese({ card }: { card: Flashcard }) {
  return (
    <div className="space-y-1">
      <div className={`ja ${card.japanese.length > 12 ? 'text-2xl' : 'text-4xl'}`}>{card.japanese}</div>
      {card.reading && card.reading !== card.japanese && <div className="ja text-sm text-muted">{card.reading}</div>}
    </div>
  );
}

function Front({ card, mode }: { card: Flashcard; mode: ModeId }) {
  if (mode === 'en-ja') return <div className="text-2xl font-medium">{card.english}</div>;
  if (mode === 'romaji-en') return <div className="text-2xl italic">{card.romaji || card.reading || card.japanese}</div>;
  if (mode === 'ja-en')
    return (
      <div className="flex flex-col items-center gap-3">
        <Japanese card={card} />
        <span onClick={(e) => e.stopPropagation()}><PlayButton src={audioSrc(card)} autoPlayKey={card.id} /></span>
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <PlayButton src={audioSrc(card)} autoPlayKey={card.id} size="lg" label="Play again" />
      <span className="text-xs text-muted">Listen — what does it mean?</span>
    </div>
  );
}

function Back({ card, mode }: { card: Flashcard; mode: ModeId }) {
  const audio = (
    <span onClick={(e) => e.stopPropagation()}>
      <PlayButton src={audioSrc(card)} autoPlayKey={mode === 'en-ja' ? `${card.id}-back` : undefined} />
    </span>
  );
  if (mode === 'en-ja')
    return (
      <div className="flex flex-col items-center gap-3">
        <Japanese card={card} />
        {card.romaji && <div className="italic text-muted">{card.romaji}</div>}
        {audio}
        <div className="text-sm text-muted">{card.english}</div>
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-2xl font-medium">{card.english}</div>
      <div className="ja text-xl">{card.japanese}</div>
      {card.romaji && <div className="text-sm italic text-muted">{card.romaji}</div>}
      {audio}
    </div>
  );
}
