'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { cardKey } from '@/lib/card-key';

export type CardInput = {
  kind: 'vocab' | 'phrase';
  japanese: string;
  reading?: string;
  romaji?: string;
  english: string;
  lessonId?: string;
  vocabId?: string;
  generationId?: string;
  segmentId?: string;
};
type Known = Record<string, { id: string; pile: number }>;

const Ctx = createContext<{ known: Known; toggle: (c: CardInput) => Promise<void>; busy: string | null } | null>(null);

/** Which items are already flashcards, so every toggle on the page can show and change its state. */
export function FlashcardsProvider({ initial, children }: { initial: { key: string; id: string; pile: number }[]; children: React.ReactNode }) {
  const [known, setKnown] = useState<Known>(() => Object.fromEntries(initial.map((c) => [c.key, { id: c.id, pile: c.pile }])));
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = useCallback(
    async (c: CardInput) => {
      const key = cardKey(c);
      setBusy(key);
      try {
        const existing = known[key];
        if (existing) {
          const res = await fetch(`/api/flashcards/${existing.id}`, { method: 'DELETE' });
          if (!res.ok && res.status !== 404) throw new Error('Could not remove card');
          setKnown(({ [key]: _gone, ...rest }) => rest);
        } else {
          const res = await fetch('/api/flashcards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not add card');
          setKnown((k) => ({ ...k, [key]: { id: data.card.id, pile: data.card.pile } }));
        }
      } catch (err) {
        alert((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [known]
  );

  return <Ctx.Provider value={{ known, toggle, busy }}>{children}</Ctx.Provider>;
}

export function FlashcardToggle({ card, className = '' }: { card: CardInput; className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const key = cardKey(card);
  const on = !!ctx.known[key];
  const label = on ? 'In flashcards — click to remove' : 'Add to flashcards';
  return (
    <button
      type="button"
      onClick={() => ctx.toggle(card)}
      disabled={ctx.busy === key}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`inline-grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-50 ${
        on ? 'border-accent bg-accent text-accent-ink' : 'border-line text-muted hover:border-accent hover:text-accent'
      } ${className}`}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <rect x="4.5" y="1.5" width="9" height="11" rx="1.5" />
        <path d="M2.5 4.5v8a2 2 0 0 0 2 2h6" />
        {on ? <path d="M7 7l1.7 1.7L11.5 5.8" strokeLinecap="round" /> : <path d="M9 4.5v5M6.5 7h5" strokeLinecap="round" />}
      </svg>
    </button>
  );
}
