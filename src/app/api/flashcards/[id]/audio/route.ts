import { handle } from '@/lib/http';
import { getCard } from '@/lib/flashcards';
import { HttpError } from '@/lib/generations';
import { itemClip, segmentClip } from '@/lib/segment-audio';
import { mp3Response } from '@/lib/audio/serve';

/** Transcript phrases reuse their lesson recording; other cards are voiced once and cached. */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const card = getCard(id);
  if (!card) throw new HttpError(404, 'Card not found');
  const file = (card.generationId && card.segmentId && (await segmentClip(card.generationId, card.segmentId))) || (await itemClip(card));
  return mp3Response(file);
});
