import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TtsProvider, TtsRequest } from './types';
import { runFfmpeg } from '../audio/ffmpeg';
import { estimateSpeechSeconds } from '../script/duration';

/** Produces a soft tone per segment (pitch by voice) with a speech-like duration. No API calls. */
export class MockTtsProvider implements TtsProvider {
  readonly name = 'mock';
  readonly model = 'mock-tone-v1';

  async synthesize(req: TtsRequest): Promise<Buffer> {
    const seconds = Math.max(0.4, estimateSpeechSeconds({ language: req.language, text: req.text, speechRate: req.speechRate }, req.speed / rateFactor(req)) - 0.3);
    const freq = 200 + (hash(req.voiceId) % 6) * 80 + (req.language === 'en' ? 0 : 40);
    const dir = await mkdtemp(path.join(tmpdir(), 'mocktts-'));
    const out = path.join(dir, 'seg.mp3');
    try {
      await runFfmpeg([
        '-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=44100:duration=${seconds.toFixed(2)}`,
        '-af', 'volume=0.25,afade=t=in:d=0.05,afade=t=out:st=' + Math.max(0, seconds - 0.08).toFixed(2) + ':d=0.08',
        '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', out,
      ]);
      return await readFile(out);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

// speed passed in already includes the rate factor; undo it because estimateSpeechSeconds re-applies it
const RATES = { slow: 0.8, medium: 0.87, natural: 0.95, gentle: 0.85 } as const;
const rateFactor = (r: TtsRequest) => RATES[r.speechRate];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
