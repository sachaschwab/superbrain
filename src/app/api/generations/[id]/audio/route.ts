import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { handle } from '@/lib/http';
import { HttpError } from '@/lib/generations';
import { getDb, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Node file stream → web stream with backpressure; tolerates clients that cancel mid-stream (seeking). */
function fileStream(file: string, opts: { start?: number; end?: number } = {}): ReadableStream<Uint8Array> {
  const node = createReadStream(file, opts);
  let closed = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      node.on('data', (chunk) => {
        if (closed) return;
        controller.enqueue(new Uint8Array(chunk as Buffer));
        if ((controller.desiredSize ?? 1) <= 0) node.pause();
      });
      node.on('end', () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
      node.on('error', (err) => {
        if (!closed) {
          closed = true;
          controller.error(err);
        }
      });
    },
    pull() {
      node.resume();
    },
    cancel() {
      closed = true;
      node.destroy();
    },
  });
}

/** Streams the MP3 with HTTP Range support (needed for seeking, esp. in Safari). ?download=1 forces a download. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const gen = getDb().select().from(schema.generations).where(eq(schema.generations.id, id)).get();
  if (!gen?.audioPath || gen.status !== 'ready') throw new HttpError(404, 'Audio not available');
  const { size } = await stat(gen.audioPath);
  const url = new URL(req.url);
  const headers: Record<string, string> = { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' };
  if (url.searchParams.get('download')) headers['content-disposition'] = `attachment; filename="${gen.lessonId}.mp3"`;

  const range = req.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    const stream = fileStream(gen.audioPath, { start, end });
    return new Response(stream, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
  }
  const stream = fileStream(gen.audioPath);
  return new Response(stream, { headers: { ...headers, 'content-length': String(size) } });
});
