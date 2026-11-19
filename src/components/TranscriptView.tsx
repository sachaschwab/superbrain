'use client';

import { useEffect, useState } from 'react';
import type { Transcript } from '@/lib/script/transcript';
import { normJa } from '@/lib/card-key';
import { PlayButton } from './PlayButton';
import { FlashcardToggle } from './flashcards/FlashcardsProvider';

type Vocab = { id: string; japanese: string; reading: string; romaji: string; english: string };

export function TranscriptView({ generationId, vocab = [] }: { generationId: string; vocab?: Vocab[] }) {
  const [t, setT] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRomaji, setShowRomaji] = useState(true);

  useEffect(() => {
    fetch(`/api/generations/${generationId}/transcript`)
      .then(async (r) => (r.ok ? setT(await r.json()) : setError((await r.json()).error)))
      .catch((e) => setError(String(e)));
  }, [generationId]);

  if (error) return <p className="mt-4 text-sm text-bad">{error}</p>;
  if (!t) return <p className="mt-4 text-sm text-muted">Loading transcript…</p>;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{t.title}</h3>
          <p className="text-sm text-muted">{t.situation}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-muted">
            <input type="checkbox" checked={showRomaji} onChange={(e) => setShowRomaji(e.target.checked)} /> Romaji
          </label>
          <a className="btn" href={`/api/generations/${generationId}/transcript?format=md`}>Download transcript</a>
        </div>
      </div>
      <div className="space-y-2">
        {t.steps.map((step) => (
          <details key={step.number} className="rounded-lg border border-line" open={step.number === 1}>
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">
              <span className="mr-2 text-muted">{step.number}.</span>
              {step.name}
              <span className="ml-2 text-xs font-normal text-muted">{step.lines.length} lines</span>
            </summary>
            <div className="space-y-3 px-4 pb-4 pt-1">
              {step.lines.map((l) => (
                <div key={l.id} className="grid grid-cols-[5.5rem_1fr] gap-3 text-sm">
                  <div className="flex flex-col items-start gap-1.5">
                    <span className="ja pt-0.5 text-xs text-muted">{l.speakerName}</span>
                    <div className="flex flex-col gap-1.5">
                      <PlayButton src={`/api/generations/${generationId}/segments/${l.id}/audio`} label={`Play: ${l.text}`} />
                      {l.language === 'ja-JP' && (
                        <FlashcardToggle card={cardFor(l, vocab, t.lessonId, generationId)} />
                      )}
                    </div>
                  </div>
                  {l.language === 'en' ? (
                    <p className="text-muted">{l.text}</p>
                  ) : (
                    <div>
                      <p className="ja text-base">{l.text}</p>
                      {l.reading && l.reading !== l.text && <p className="ja text-xs text-muted">{l.reading}</p>}
                      {showRomaji && l.romaji && <p className="text-xs italic text-muted">{l.romaji}</p>}
                      {l.translation && <p className="mt-0.5">{l.translation}</p>}
                      {l.structuralTranslation && <p className="text-xs text-accent">Structure: {l.structuralTranslation}</p>}
                      {l.grammarNote && <p className="ja text-xs text-muted">✎ {l.grammarNote}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

/** A line that is just one of the lesson's words toggles that vocabulary card; anything else is a phrase. */
function cardFor(l: Transcript['steps'][number]['lines'][number], vocab: Vocab[], lessonId: string, generationId: string) {
  const n = normJa(l.text);
  const v = vocab.find((x) => [x.japanese, x.reading].some((f) => f.split('/').some((p) => normJa(p) === n)));
  if (v) return { kind: 'vocab' as const, vocabId: v.id, lessonId, japanese: v.japanese, reading: v.reading, romaji: v.romaji, english: v.english };
  return { kind: 'phrase' as const, japanese: l.text, reading: l.reading, romaji: l.romaji, english: l.translation || '(no translation)', lessonId, generationId, segmentId: l.id };
}
