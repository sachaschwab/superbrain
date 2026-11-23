import { eq } from 'drizzle-orm';
import { handle } from '@/lib/http';
import { HttpError } from '@/lib/generations';
import { getDb, schema } from '@/lib/db';
import { streamMp3 } from '@/lib/audio/serve';

export const dynamic = 'force-dynamic';

/** ?download=1 forces a download. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const gen = getDb().select().from(schema.generations).where(eq(schema.generations.id, id)).get();
  if (!gen?.audioPath || gen.status !== 'ready') throw new HttpError(404, 'Audio not available');
  return streamMp3(req, gen.audioPath, new URL(req.url).searchParams.get('download') ? `${gen.lessonId}.mp3` : undefined);
});
