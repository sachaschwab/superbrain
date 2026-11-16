import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

let resolved: string | null = null;

/** FFMPEG_PATH → bundled ffmpeg-static binary → system ffmpeg on PATH. */
export function ffmpegPath(): string {
  if (resolved) return resolved;
  if (process.env.FFMPEG_PATH) return (resolved = process.env.FFMPEG_PATH);
  try {
    const p = createRequire(import.meta.url)('ffmpeg-static') as string | null;
    if (p && existsSync(p)) return (resolved = p);
  } catch {}
  return (resolved = 'ffmpeg');
}

export function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(/*turbopackIgnore: true*/ ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', (err) => reject(new Error(`Could not start ffmpeg (${ffmpegPath()}): ${err.message}`)));
    proc.on('close', (code) => (code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-800)}`))));
  });
}

/** Duration in seconds, read via ffmpeg's own probe output (avoids needing ffprobe). */
export async function probeDuration(file: string): Promise<number> {
  const out = await new Promise<string>((resolve) => {
    const proc = spawn(/*turbopackIgnore: true*/ ffmpegPath(), ['-hide_banner', '-i', file, '-f', 'null', '-']);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('close', () => resolve(stderr));
    proc.on('error', () => resolve(''));
  });
  const all = [...out.matchAll(/time=(\d+):(\d+):([\d.]+)/g)];
  const m = all.at(-1) ?? out.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}
