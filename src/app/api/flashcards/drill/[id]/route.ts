import { access } from 'node:fs/promises';
import { handle } from '@/lib/http';
import { HttpError } from '@/lib/generations';
import { drillFile, isDrillId } from '@/lib/drill';
import { streamMp3 } from '@/lib/audio/serve';

export const dynamic = 'force-dynamic';

/** ?download=1 forces a download. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!isDrillId(id)) throw new HttpError(404, 'Drill not found');
  const file = drillFile(id);
  await access(file).catch(() => { throw new HttpError(404, 'Drill not found — make a new one'); });
  const date = new Date().toISOString().slice(0, 10);
  return streamMp3(req, file, new URL(req.url).searchParams.get('download') ? `japanese-drill-${date}.mp3` : undefined);
});
