import { existsSync, statSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@/lib/db';
import { updateSettings } from '@/lib/settings';
import { startGeneration, getGenerationView, retryGeneration, HttpError, lessonSummaries } from '@/lib/generations';
import { startWorker, tick } from '@/lib/jobs/worker';
import { runGeneration } from '@/lib/pipeline';
import { MockLlmProvider, buildMockScript } from '@/lib/llm/mock';
import { MockTtsProvider } from '@/lib/tts/mock';
import type { LlmProvider, JsonRequest } from '@/lib/llm/types';
import type { TtsProvider, TtsRequest } from '@/lib/tts/types';
import { assembleLesson } from '@/lib/audio/assemble';
import { withRetry, TransientError } from '@/lib/retry';
import { freshDb } from './helpers';

const LESSON = 'ja-beginner-01';

async function drain(id: string) {
  for (let i = 0; i < 200; i++) {
    await tick();
    const v = getGenerationView(id)!;
    if (v.status === 'ready' || v.status === 'failed') return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('generation did not finish');
}

let db: ReturnType<typeof freshDb>;
beforeEach(() => {
  db = freshDb();
  updateSettings({ llm: { provider: 'mock' }, tts: { provider: 'mock' }, targetDurationMinutes: 6 });
  startWorker({});
});

describe('generation pipeline (mock LLM + mock TTS)', () => {
  it('produces a playable MP3, transcript and persisted records', async () => {
    const { generationId } = await startGeneration(LESSON, {});
    const v = await drain(generationId);
    expect(v.status).toBe('ready');
    expect(v.durationSeconds).toBeGreaterThan(5 * 60);
    const row = db.select().from(schema.generations).where(eq(schema.generations.id, generationId)).get()!;
    expect(existsSync(row.audioPath!)).toBe(true);
    expect(statSync(row.audioPath!).size).toBeGreaterThan(10_000);
    expect(existsSync(row.transcriptPath!)).toBe(true);
    expect(JSON.parse(row.configSnapshot).llm.provider).toBe('mock');
    expect(row.llmModel).toBe('mock-script-v1');
    expect(row.ttsModel).toBe('mock-tone-v1');
    expect(lessonSummaries().find((l) => l.id === LESSON)!.readyGenerationId).toBe(generationId);
  });

  it('prevents duplicate concurrent jobs for the same lesson', async () => {
    const first = await startGeneration(LESSON, {});
    await expect(startGeneration(LESSON, {})).rejects.toMatchObject({ status: 409 });
    const dup = await startGeneration(LESSON, { allowDuplicate: true });
    expect(dup.generationId).not.toBe(first.generationId);
    await drain(first.generationId);
    await drain(dup.generationId);
  });

  it('asks for confirmation when the estimate exceeds the limit', async () => {
    updateSettings({ tts: { provider: 'elevenlabs' }, pricing: { ttsPer1kCharsUsd: 0.3 }, maxEstimatedCostPerLessonUsd: 0.01 });
    const err = await startGeneration(LESSON, {}).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(402);
    expect(err.body.needsConfirmation).toBe(true);
  });

  it('regenerating keeps the previous result and audio-only reuses the script', async () => {
    const a = await startGeneration(LESSON, {});
    await drain(a.generationId);
    const b = await startGeneration(LESSON, { mode: 'audio_only' });
    const vb = await drain(b.generationId);
    expect(vb.status).toBe('ready');
    const rows = db.select().from(schema.generations).all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === b.generationId)!.scriptJson).toBe(rows.find((r) => r.id === a.generationId)!.scriptJson);
    expect(vb.usage.llmOutputTokens).toBe(0);
  });

  it('records phase transitions in order', async () => {
    // Insert without a job so the background worker does not pick it up concurrently.
    const generationId = 'phase-test';
    db.insert(schema.generations).values({ id: generationId, lessonId: LESSON, configSnapshot: JSON.stringify((await import('@/lib/settings')).getSettings()) }).run();
    const phases: string[] = [];
    await runGeneration(generationId, (p) => phases.at(-1) !== p && phases.push(p), {});
    expect(phases).toEqual(['script_generation', 'script_validation', 'speech_synthesis', 'audio_assembly', 'ready']);
  });
});

describe('failure handling', () => {
  it('requests a targeted correction when the first script is invalid', async () => {
    const calls: string[] = [];
    const llm = (s: Parameters<typeof buildMockScript>[1]): LlmProvider => ({
      name: 'fake', model: 'fake-1',
      async generateJson(req: JsonRequest) {
        calls.push(req.kind);
        if (req.kind === 'review') return { data: { approved: true, issues: [] }, usage: { inputTokens: 5, outputTokens: 5 }, stopReason: 'end_turn' };
        const script = buildMockScript(req.ctx, s);
        if (calls.length === 1) script.segments = script.segments.filter((x) => x.stepNumber !== 6); // invalid
        return { data: script, usage: { inputTokens: 10, outputTokens: 20 }, stopReason: 'end_turn' };
      },
    });
    startWorker({ llm });
    const { generationId } = await startGeneration(LESSON, {});
    const v = await drain(generationId);
    expect(v.status).toBe('ready');
    expect(calls).toEqual(['script', 'correction', 'review']);
    expect(v.validation.correctionRounds).toBe(1);
    expect(v.usage.llmOutputTokens).toBe(45);
  });

  it('never synthesises a script that stays invalid', async () => {
    let synthCalls = 0;
    const llm = (s: Parameters<typeof buildMockScript>[1]): LlmProvider => ({
      name: 'fake', model: 'fake-1',
      async generateJson(req: JsonRequest) {
        const script = buildMockScript(req.ctx, s);
        script.segments = script.segments.filter((x) => x.stepNumber !== 12);
        return { data: script, usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end_turn' };
      },
    });
    const tts = (): TtsProvider => ({ name: 'count', model: 'c', synthesize: async () => { synthCalls++; return Buffer.alloc(0); } });
    startWorker({ llm, tts });
    const { generationId } = await startGeneration(LESSON, {});
    const v = await drain(generationId);
    expect(v.status).toBe('failed');
    expect(v.errorMessage).toMatch(/Step 12 is missing/);
    expect(v.hasScript).toBe(false);
    expect(v.validation.rejectedScript).toBeTruthy();
    expect(synthCalls).toBe(0);
  });

  it('a failed TTS segment fails the job, and Retry resumes without redoing finished segments', async () => {
    const real = new MockTtsProvider();
    let calls = 0;
    let failOnce = true;
    const tts = (): TtsProvider => ({
      name: 'flaky', model: 'flaky-1',
      async synthesize(req: TtsRequest) {
        calls++;
        if (calls === 30 && failOnce) {
          failOnce = false;
          throw Object.assign(new Error('voice not found'), { status: 404 }); // non-transient
        }
        return real.synthesize(req);
      },
    });
    startWorker({ tts });
    const { generationId } = await startGeneration(LESSON, {});
    const failed = await drain(generationId);
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toMatch(/Retry/);
    expect(failed.hasScript).toBe(true);
    const callsBefore = calls;

    retryGeneration(generationId);
    const v = await drain(generationId);
    expect(v.status).toBe('ready');
    expect(v.job!.retryCount).toBe(1);
    const script = JSON.parse(db.select().from(schema.generations).where(eq(schema.generations.id, generationId)).get()!.scriptJson!);
    const unique = new Set(script.segments.map((s: { text: string; speaker: string; speechRate: string }) => `${s.speaker}|${s.speechRate}|${s.text}`)).size;
    // second run only synthesises what was not cached
    expect(calls - callsBefore).toBeLessThan(unique);
  });

  it('retries transient errors with backoff', async () => {
    let n = 0;
    const out = await withRetry(async () => {
      if (++n < 3) throw new TransientError('429', 429);
      return 'ok';
    }, { baseMs: 1 });
    expect(out).toBe('ok');
    expect(n).toBe(3);
    await expect(withRetry(async () => { throw Object.assign(new Error('bad'), { status: 400 }); }, { baseMs: 1 })).rejects.toThrow('bad');
  });
});

describe('audio assembly', () => {
  it('inserts programmatic pauses between clips', async () => {
    const tts = new MockTtsProvider();
    const dir = await mkdtemp(path.join(tmpdir(), 'asm-'));
    const { writeFile } = await import('node:fs/promises');
    const a = path.join(dir, 'a.mp3');
    const b = path.join(dir, 'b.mp3');
    await writeFile(a, await tts.synthesize({ text: 'こんにちは', voiceId: 'f', language: 'ja-JP', speechRate: 'natural', speed: 1, stability: 0.5 }));
    await writeFile(b, await tts.synthesize({ text: 'Hello there', voiceId: 'n', language: 'en', speechRate: 'natural', speed: 1, stability: 0.5 }));
    const out = path.join(dir, 'out.mp3');
    const withPause = await assembleLesson([{ file: a, pauseAfterMs: 3000 }, { file: b, pauseAfterMs: 0 }], out, path.join(dir, 'w1'));
    const noPause = await assembleLesson([{ file: a, pauseAfterMs: 0 }, { file: b, pauseAfterMs: 0 }], out, path.join(dir, 'w2'));
    expect(withPause.duration - noPause.duration).toBeGreaterThan(2.8);
    expect(withPause.duration - noPause.duration).toBeLessThan(3.2);
  });
});
