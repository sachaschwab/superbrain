import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';

/** Short clips are small: send them whole. */
export async function mp3Response(file: string) {
  return new Response(new Uint8Array(await readFile(file)), { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' } });
}

/** Node file stream → web stream with backpressure; tolerates clients that cancel mid-stream (seeking). */
export function fileStream(file: string, opts: { start?: number; end?: number } = {}): ReadableStream<Uint8Array> {
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

/** Streams an MP3 with HTTP Range support (needed for seeking, esp. in Safari). Pass a filename to force a download. */
export async function streamMp3(req: Request, file: string, downloadName?: string) {
  const { size } = await stat(file);
  const headers: Record<string, string> = { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' };
  if (downloadName) headers['content-disposition'] = `attachment; filename="${downloadName}"`;
  const range = req.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    return new Response(fileStream(file, { start, end }), { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
  }
  return new Response(fileStream(file), { headers: { ...headers, 'content-length': String(size) } });
}
