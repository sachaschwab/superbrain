import { handle } from '@/lib/http';
import { HttpError } from '@/lib/generations';
import { segmentClip } from '@/lib/segment-audio';
import { mp3Response } from '@/lib/audio/serve';

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string; segmentId: string }> }) => {
  const { id, segmentId } = await params;
  const file = await segmentClip(id, segmentId);
  if (!file) throw new HttpError(404, 'Segment not found');
  return mp3Response(file);
});
