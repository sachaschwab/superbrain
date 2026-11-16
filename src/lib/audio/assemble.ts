import { mkdir, rm, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg, probeDuration } from './ffmpeg';

export type AssemblyItem = { file: string; pauseAfterMs: number };

const SAMPLE_RATE = 44100;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

/**
 * Phase E: normalise each speech clip, insert programmatic silences, concatenate,
 * limit peaks and encode one MP3. Silence is generated, never synthesised as speech.
 */
export async function assembleLesson(items: AssemblyItem[], outFile: string, workDir: string, onProgress?: (done: number, total: number) => void) {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  // 1. Each distinct clip → mono 44.1 kHz WAV at a consistent loudness, with tiny fades against clicks.
  const unique = [...new Set(items.map((i) => i.file))];
  const wavFor = new Map<string, string>();
  let done = 0;
  await mapLimit(unique, 4, async (file, i) => {
    const wav = path.join(workDir, `clip-${i}.wav`);
    await runFfmpeg([
      '-i', file,
      '-af', 'loudnorm=I=-20:TP=-2:LRA=7,afade=t=in:d=0.02,areverse,afade=t=in:d=0.03,areverse',
      '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s16le', wav,
    ]);
    wavFor.set(file, wav);
    onProgress?.(++done, unique.length);
  });

  // 2. One WAV per distinct pause length.
  const silences = new Map<number, string>();
  const lead = 1000;
  for (const ms of new Set([lead, ...items.map((i) => i.pauseAfterMs).filter((ms) => ms > 0)])) {
    const wav = path.join(workDir, `silence-${ms}.wav`);
    await runFfmpeg(['-f', 'lavfi', '-i', `anullsrc=r=${SAMPLE_RATE}:cl=mono`, '-t', (ms / 1000).toFixed(3), '-c:a', 'pcm_s16le', wav]);
    silences.set(ms, wav);
  }

  // 3. Concatenate in order.
  const lines = [`file '${silences.get(lead)}'`];
  for (const it of items) {
    lines.push(`file '${wavFor.get(it.file)!.replace(/'/g, "'\\''")}'`);
    if (it.pauseAfterMs > 0) lines.push(`file '${silences.get(it.pauseAfterMs)}'`);
  }
  const list = path.join(workDir, 'list.txt');
  await writeFile(list, lines.join('\n'));

  // 4. Gentle peak limiting (no pumping compression), MP3 encode, atomic move into place.
  await mkdir(path.dirname(outFile), { recursive: true });
  const tmp = path.join(workDir, 'lesson.mp3');
  await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-af', 'alimiter=limit=0.89:level=false', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k', tmp]);
  await rename(tmp, outFile);
  const duration = await probeDuration(outFile);
  await rm(workDir, { recursive: true, force: true });
  return { duration };
}
