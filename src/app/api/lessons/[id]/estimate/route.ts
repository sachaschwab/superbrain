import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import { estimateFor, HttpError } from '@/lib/generations';
import { getLesson } from '@/lib/curriculum';
import { getSettings } from '@/lib/settings';
import { exceedsLimit } from '@/lib/cost';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!getLesson(id)) throw new HttpError(404, 'Lesson not found');
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') === 'audio_only' ? 'audio_only' : 'full';
  const settings = getSettings();
  const estimate = await estimateFor(id, { mode, sourceGenerationId: url.searchParams.get('source') ?? undefined }, settings);
  return NextResponse.json({ estimate, exceedsLimit: exceedsLimit(settings, estimate), limitUsd: settings.maxEstimatedCostPerLessonUsd });
});
