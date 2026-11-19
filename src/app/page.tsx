import Link from 'next/link';
import { lessonSummaries } from '@/lib/generations';
import { StatusBadge } from '@/components/StatusBadge';
import { STEPS } from '@/lib/config';
import { getSettings } from '@/lib/settings';
import { listCards } from '@/lib/flashcards';
import { FlashcardLauncher } from '@/components/flashcards/FlashcardLauncher';

export const dynamic = 'force-dynamic';

export default function CurriculumPage() {
  const lessons = lessonSummaries();
  const generated = lessons.filter((l) => l.readyGenerationId).length;
  const minutes = getSettings().targetDurationMinutes;
  const totalHours = ((lessons.length * minutes) / 60).toFixed(1);
  const counts = { vocab: {} as Record<number, number>, phrase: {} as Record<number, number> };
  for (const c of listCards()) counts[c.kind][c.pile] = (counts[c.kind][c.pile] ?? 0) + 1;

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Japanese at Night</h1>
          <p className="mt-1 text-muted">Learn through listening, structure, and repetition</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [lessons.length, 'Lessons'],
            [`${generated} / ${lessons.length}`, 'Audio generated'],
            [STEPS.length, 'Steps per lesson'],
            [`~${minutes}m`, 'Per lesson'],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl border border-line bg-surface p-4">
              <div className="text-2xl font-semibold">{v}</div>
              <div className="text-sm text-muted">{l}</div>
            </div>
          ))}
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          A progressive beginner course of {lessons.length} lessons (about {totalHours} hours of audio). Each lesson follows the same 12-step
          sequence — dialogue, meaning, vocabulary, structure, decomposition, variation, anticipation, replay — and ends in relaxed
          listening with nothing new. Words and grammar from earlier lessons return in later ones.
        </p>
      </section>

      <FlashcardLauncher counts={counts} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lessons.map((l) => (
          <Link
            key={l.id}
            href={`/lessons/${l.id}`}
            className="group flex flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-accent"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-wider text-muted">LESSON {String(l.number).padStart(2, '0')}</span>
              <StatusBadge status={l.status} />
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-snug">{l.title}</h2>
            <p className="mt-1 text-sm text-muted">{l.description}</p>
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted">Words</dt>
                <dd className="ja truncate">{l.vocabularyFocus} …</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted">Grammar</dt>
                <dd className="ja line-clamp-2">{l.grammarFocus}</dd>
              </div>
            </dl>
            <div className="mt-auto flex items-center justify-between pt-4 text-sm">
              <span className="text-muted">{l.vocabularyCount} words · ~{l.estimatedMinutes} min</span>
              <span className="font-medium text-accent group-hover:underline">Open lesson →</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
