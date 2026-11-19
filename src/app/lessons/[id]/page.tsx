import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildLessonContext, getLesson } from '@/lib/curriculum';
import { estimateFor, listGenerations } from '@/lib/generations';
import { getSettings } from '@/lib/settings';
import { stepTargets } from '@/lib/config';
import { exceedsLimit } from '@/lib/cost';
import { LessonClient } from './LessonClient';
import { loadCurriculum } from '@/lib/curriculum';
import { listCards } from '@/lib/flashcards';
import { FlashcardsProvider, FlashcardToggle } from '@/components/flashcards/FlashcardsProvider';
import { RomajiText } from '@/components/RomajiText';

export const dynamic = 'force-dynamic';

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getLesson(id)) notFound();
  const ctx = buildLessonContext(id);
  const settings = getSettings();
  const estimate = await estimateFor(id, { mode: 'full' }, settings);
  const { lesson } = ctx;
  const glossary = loadCurriculum().romajiGlossary;
  const cards = listCards().map((c) => ({ key: c.key, id: c.id, pile: c.pile }));

  return (
    <FlashcardsProvider initial={cards}>
    <div className="space-y-8">
      <Link href="/" className="text-sm text-muted hover:text-ink">← All lessons</Link>

      <header className="space-y-3">
        <div className="text-xs font-medium tracking-wider text-muted">LESSON {String(lesson.number).padStart(2, '0')} · {lesson.topic.toUpperCase()}</div>
        <h1 className="text-3xl font-semibold tracking-tight">{lesson.title}</h1>
        <p className="max-w-3xl text-muted">{lesson.description}</p>
        <ul className="flex flex-wrap gap-2 pt-1">
          {lesson.targetRegisters.map((r) => (
            <li key={r} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{r}</li>
          ))}
          <li className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">~{settings.targetDurationMinutes} min</li>
        </ul>
      </header>

      <LessonClient
        lessonId={lesson.id}
        vocab={lesson.vocabularyTargets}
        initialGenerations={listGenerations(id)}
        fullEstimate={estimate}
        fullExceedsLimit={exceedsLimit(settings, estimate)}
        limitUsd={settings.maxEstimatedCostPerLessonUsd}
        providers={{ llm: `${settings.llm.provider} / ${settings.llm.model}`, tts: `${settings.tts.provider} / ${settings.tts.model}` }}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          <Card title="Objectives">
            <ul className="list-disc space-y-1 pl-5 text-sm">{lesson.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
          </Card>

          <Card title={`Vocabulary · ${lesson.vocabularyTargets.length} words`}>
            <table className="w-full text-sm">
              <tbody>
                {lesson.vocabularyTargets.map((v) => (
                  <tr key={v.id} className="border-t border-line first:border-0">
                    <td className="ja py-2 pr-3 text-base">{v.japanese}</td>
                    <td className="ja py-2 pr-3 text-muted">{v.reading !== v.japanese ? v.reading : ''}</td>
                    <td className="py-2 pr-3 italic text-muted">{v.romaji}</td>
                    <td className="py-2 pr-3">{v.english}</td>
                    <td className="hidden py-2 pr-3 text-xs text-muted sm:table-cell">{v.partOfSpeech}</td>
                    <td className="py-2 text-right">
                      <FlashcardToggle card={{ kind: 'vocab', vocabId: v.id, lessonId: lesson.id, japanese: v.japanese, reading: v.reading, romaji: v.romaji, english: v.english }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Grammar">
            <div className="space-y-5">
              {lesson.grammarTargets.map((g) => (
                <div key={g.id}>
                  <div className="flex items-center gap-2">
                    <h3 className="ja font-medium">{g.name}</h3>
                    <span className="rounded bg-surface-2 px-1.5 text-xs text-muted">{g.role}</span>
                  </div>
                  <p className="ja mt-1 text-sm leading-relaxed text-muted">{g.explanation}</p>
                  <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                    {g.examples.map((e) => (
                      <li key={e.japanese} className="flex items-start justify-between gap-3 px-3 py-2">
                        <div>
                          <div className="ja text-base">{e.japanese}</div>
                          <div className="text-xs italic text-muted">{e.romaji}</div>
                          <div className="text-sm">{e.english}</div>
                        </div>
                        <FlashcardToggle card={{ kind: 'phrase', lessonId: lesson.id, japanese: e.japanese, romaji: e.romaji, english: e.english }} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          {lesson.teachingNotes && (
            <Card title="Teaching notes">
              <p className="text-sm leading-relaxed text-muted"><RomajiText text={lesson.teachingNotes} glossary={glossary} /></p>
            </Card>
          )}
        </section>

        <aside className="space-y-6">
          <Card title="Review from earlier lessons">
            {ctx.reviewVocabulary.length === 0 ? (
              <p className="text-sm text-muted">First lesson — nothing to review yet.</p>
            ) : (
              <>
                <ul className="ja space-y-1 text-sm">
                  {ctx.reviewVocabulary.map((v) => (
                    <li key={v.id} className="flex justify-between gap-3"><span>{v.japanese}</span><span className="text-muted">{v.english}</span></li>
                  ))}
                </ul>
                <ul className="ja mt-3 space-y-1 border-t border-line pt-3 text-sm text-muted">
                  {ctx.reviewGrammar.map((g) => <li key={g.id}>{g.name}</li>)}
                </ul>
              </>
            )}
          </Card>

          <Card title="12-step sequence">
            <ol className="space-y-1.5 text-sm">
              {stepTargets(settings).map((s) => (
                <li key={s.number} className="flex justify-between gap-3">
                  <span><span className="inline-block w-6 text-muted">{s.number}</span>{s.name}</span>
                  <span className="text-muted">{s.targetSeconds >= 60 ? `${(s.targetSeconds / 60).toFixed(1)}m` : `${s.targetSeconds}s`}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Generation configuration">
            <dl className="space-y-1 text-sm">
              {[
                ['Script', `${settings.llm.provider} · ${settings.llm.model}`],
                ['Voice', `${settings.tts.provider} · ${settings.tts.model}`],
                ['Duration', `${settings.targetDurationMinutes} min`],
                ['Speech speed', `${settings.speechSpeed}×`],
                ['Grammar depth', settings.grammarDepth],
                ['Review', settings.reviewIntensity],
                ['Linguistic review', settings.llm.linguisticReview ? 'on' : 'off'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            <Link href="/settings" className="mt-3 inline-block text-sm text-accent hover:underline">Change settings →</Link>
          </Card>
        </aside>
      </div>
    </div>
    </FlashcardsProvider>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}
