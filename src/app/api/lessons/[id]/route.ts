import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import { buildLessonContext, getLesson } from '@/lib/curriculum';
import { HttpError, listGenerations } from '@/lib/generations';
import { getSettings } from '@/lib/settings';
import { stepTargets } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!getLesson(id)) throw new HttpError(404, 'Lesson not found');
  const ctx = buildLessonContext(id);
  return NextResponse.json({
    lesson: ctx.lesson,
    review: { vocabulary: ctx.reviewVocabulary, grammar: ctx.reviewGrammar },
    steps: stepTargets(getSettings()),
    generations: listGenerations(id),
  });
});
