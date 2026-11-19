import { readFile } from 'node:fs/promises';

/** Short clips are small: send them whole. */
export async function mp3Response(file: string) {
  return new Response(new Uint8Array(await readFile(file)), { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' } });
}
