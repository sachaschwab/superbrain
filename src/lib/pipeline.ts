import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb, schema } from './db';
import type { GenerationStatus } from './db/schema';
import { SettingsSchema, type Settings } from './config';
import { buildLessonContext } from './curriculum';
import { createLlmProvider, type LlmProvider } from './llm';
import { createTtsProvider, buildTtsRequests, synthesizeCached, type TtsProvider } from './tts';
import { generateValidatedScript, ScriptValidationError } from './script/generate';
import { LessonScriptSchema, type LessonScript } from './script/schema';
import { buildTranscript, transcriptToMarkdown } from './script/transcript';
import { assembleLesson } from './audio/assemble';
import { generationDir } from './paths';
import { priceUsage } from './cost';
import { safeErrorMessage } from './retry';

export type PhaseUpdate = (phase: GenerationStatus, progress: number, message: string) => void;

export type PipelineDeps = {
  llm?: (s: Settings) => LlmProvider;
  tts?: (s: Settings) => TtsProvider;
};

const TTS_CONCURRENCY = 3;

function recordUsage(generationId: string, row: Omit<typeof schema.generationUsage.$inferInsert, 'id' | 'generationId'>) {
  getDb().insert(schema.generationUsage).values({ id: randomUUID(), generationId, ...row }).run();
}

/**
 * Runs phases A–F for one generation. Resumable: a generation that already has a script
 * skips straight to speech synthesis, and already-synthesised segments come from the cache.
 */
export async function runGeneration(generationId: string, update: PhaseUpdate, deps: PipelineDeps = {}) {
  const db = getDb();
  const gen = db.select().from(schema.generations).where(eq(schema.generations.id, generationId)).get();
  if (!gen) throw new Error(`Generation ${generationId} not found`);
  const settings = SettingsSchema.parse(JSON.parse(gen.configSnapshot));
  const setGen = (patch: Partial<typeof schema.generations.$inferInsert>) =>
    db.update(schema.generations).set(patch).where(eq(schema.generations.id, generationId)).run();

  setGen({ startedAt: gen.startedAt ?? new Date(), errorMessage: null });

  // Phase A — lesson context
  const ctx = buildLessonContext(gen.lessonId);

  // Phases B + C — script (or reuse)
  let script: LessonScript;
  let scriptJson = gen.scriptJson;
  if (!scriptJson && gen.mode === 'audio_only' && gen.sourceGenerationId) {
    const src = db.select().from(schema.generations).where(eq(schema.generations.id, gen.sourceGenerationId)).get();
    if (!src?.scriptJson) throw new Error('Source generation has no script to reuse');
    scriptJson = src.scriptJson;
    setGen({ scriptJson, validationJson: src.validationJson, llmProvider: src.llmProvider, llmModel: src.llmModel });
  }

  if (scriptJson) {
    script = LessonScriptSchema.parse(JSON.parse(scriptJson));
  } else {
    const llm = (deps.llm ?? createLlmProvider)(settings);
    setGen({ llmProvider: llm.name, llmModel: llm.model });
    const logLlm = (u: { inputTokens: number; outputTokens: number }) =>
      recordUsage(generationId, {
        provider: llm.name, model: llm.model, kind: 'llm', inputTokens: u.inputTokens, outputTokens: u.outputTokens,
        estimatedCostUsd: priceUsage(settings, { llmInputTokens: u.inputTokens, llmOutputTokens: u.outputTokens }).usd,
      });
    try {
      const outcome = await generateValidatedScript(ctx, settings, llm, (phase, msg) => update(phase, phase === 'script_generation' ? 0.05 : 0.2, msg));
      outcome.usage.forEach(logLlm);
      script = outcome.script;
      setGen({ scriptJson: JSON.stringify(script), validationJson: JSON.stringify(outcome.validation) });
    } catch (err) {
      if (err instanceof ScriptValidationError) {
        err.usage.forEach(logLlm);
        // Keep the rejected script for inspection; never synthesise it.
        setGen({ validationJson: JSON.stringify({ ok: false, errors: err.errors, reviewIssues: err.reviewIssues, rejectedScript: err.lastScript }) });
      }
      throw err;
    }
  }

  // Phase D — speech synthesis
  const tts = (deps.tts ?? createTtsProvider)(settings);
  setGen({ ttsProvider: tts.name, ttsModel: tts.model });
  const segs = script.segments;
  const requests = buildTtsRequests(segs, settings);
  const files: string[] = new Array(segs.length);
  let done = 0;
  let characters = 0;
  update('speech_synthesis', 0.3, `Synthesising ${segs.length} segments…`);
  let next = 0;
  const failures: string[] = [];
  await Promise.all(
    Array.from({ length: TTS_CONCURRENCY }, async () => {
      while (next < segs.length && failures.length === 0) {
        const i = next++;
        try {
          const r = await synthesizeCached(tts, requests[i], (_e, attempt) =>
            update('speech_synthesis', 0.3 + 0.5 * (done / segs.length), `Retrying segment ${segs[i].id} (attempt ${attempt + 1})…`)
          );
          files[i] = r.file;
          characters += r.characters;
        } catch (err) {
          failures.push(`${segs[i].id}: ${safeErrorMessage(err)}`);
          return;
        }
        done++;
        if (done % 5 === 0 || done === segs.length)
          update('speech_synthesis', 0.3 + 0.5 * (done / segs.length), `Synthesised ${done} of ${segs.length} segments`);
      }
    })
  );
  if (characters > 0)
    recordUsage(generationId, { provider: tts.name, model: tts.model, kind: 'tts', characters, estimatedCostUsd: priceUsage(settings, { ttsCharacters: characters }).usd });
  if (failures.length)
    throw new Error(`Speech synthesis failed for ${failures.length} segment(s) — ${done} finished segments are cached, so "Retry" resumes from here. First error: ${failures[0]}`);

  // Phase E — assembly
  const dir = generationDir(generationId);
  await mkdir(dir, { recursive: true });
  const audioPath = path.join(dir, 'lesson.mp3');
  update('audio_assembly', 0.82, 'Normalising clips and assembling the MP3…');
  const { duration } = await assembleLesson(
    segs.map((s, i) => ({ file: files[i], pauseAfterMs: s.pauseAfterMs })),
    audioPath,
    path.join(dir, 'work'),
    (d, t) => update('audio_assembly', 0.82 + 0.15 * (d / t), `Processed ${d} of ${t} clips`)
  );

  // Phase F — save results
  const lesson = ctx.lesson;
  const transcript = buildTranscript(script, lesson);
  const transcriptPath = path.join(dir, 'transcript.json');
  await writeFile(transcriptPath, JSON.stringify(transcript, null, 2));
  await writeFile(path.join(dir, 'transcript.md'), transcriptToMarkdown(transcript));
  await writeFile(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));

  const usage = db.select().from(schema.generationUsage).where(eq(schema.generationUsage.generationId, generationId)).all();
  const priced = usage.map((u) => u.estimatedCostUsd);
  const total = priced.length && priced.every((x) => x != null) ? priced.reduce((a, b) => a! + b!, 0)! : null;

  setGen({ status: 'ready', audioPath, transcriptPath, durationSeconds: duration, completedAt: new Date(), estimatedCostUsd: total ?? gen.estimatedCostUsd });
  update('ready', 1, `Ready — ${Math.round(duration / 60)} min`);
}
