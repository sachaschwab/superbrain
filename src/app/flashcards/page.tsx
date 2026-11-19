import Link from 'next/link';
import { listCards } from '@/lib/flashcards';
import { FlashcardSession } from '@/components/flashcards/FlashcardSession';
import { MODES, type KindId, type ModeId } from '@/components/flashcards/modes';

export const dynamic = 'force-dynamic';

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const mode = (MODES.some((m) => m.id === sp.mode) ? sp.mode : 'en-ja') as ModeId;
  const kinds = (sp.kinds ?? 'vocab,phrase').split(',').filter((k): k is KindId => k === 'vocab' || k === 'phrase');
  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">← Curriculum</Link>
      <FlashcardSession initialCards={listCards()} initialMode={mode} initialKinds={kinds.length ? kinds : ['vocab', 'phrase']} />
    </div>
  );
}
