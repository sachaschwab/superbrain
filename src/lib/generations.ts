import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from './db';
import { getSettings } from './settings';
import { getLesson, loadCurriculum } from './curriculum';
import { estimateAudioOnly, estimateFullGeneration, exceedsLimit, type CostEstimate } from './cost';
import { activeGenerationFor, enqueueJob, requeueGeneration } from './jobs/worker';
import { LessonScriptSchema } from './script/schema';
import { buildTtsRequest, createTtsProvider, isCached } from './tts';
import type { Settings } from './config';

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly body: Record<string, unknown> = {}) {
    super(message);
  }
}

export type GenerateRequest = { mode?: 'full' | 'audio_only'; sourceGenerationId?: string; confirmCost?: boolean; allowDuplicate?: boolean };

export async function estimateFor(lessonId: string, req: GenerateRequest, settings: Settings = getSettings()): Promise<CostEstimate> {
  if (req.mode !== 'audio_only') return estimateFullGeneration(settings);
  const src = sourceGeneration(lessonId, req.sourceGenerationId);
  const script = LessonScriptSchema.parse(JSON.parse(src.scriptJson!));
  let tts;
  try {
    tts = createTtsProvider(settings);
  } catch {
    // Missing key: estimate as if nothing were cached.
    return estimateAudioOnly(settings, script.segments.reduce((n, s) => n + s.text.length, 0));
  }
  let uncached = 0;
  for (const s of script.segments) if (!(await isCached(tts, buildTtsRequest(s, settings)))) uncached += s.text.length;
  return estimateAudioOnly(settings, uncached);
}

function sourceGeneration(lessonId: string, id?: string) {
  const db = getDb();
  const src = id
    ? db.select().from(schema.generations).where(eq(schema.generations.id, id)).get()
    : db.select().from(schema.generations).where(eq(schema.generations.lessonId, lessonId)).orderBy(desc(schema.generations.createdAt)).all().find((gn) => gn.scriptJson);
  if (!src || src.lessonId !== lessonId || !src.scriptJson) throw new HttpError(400, 'No existing script to reuse for this lesson');
  return src;
}

/** POST /api/lessons/:id/generate — returns immediately with ids; work happens in the background job. */
export async function startGeneration(lessonId: string, req: GenerateRequest) {
  if (!getLesson(lessonId)) throw new HttpError(404, 'Lesson not found');
  const active = activeGenerationFor(lessonId);
  if (active && !req.allowDuplicate)
    throw new HttpError(409, 'A generation for this lesson is already running', { generationId: active.id });

  const settings = getSettings();
  const estimate = await estimateFor(lessonId, req, settings);
  if (exceedsLimit(settings, estimate) && !req.confirmCost)
    throw new HttpError(402, `Estimated cost $${estimate.usd?.toFixed(2)} exceeds your limit of $${settings.maxEstimatedCostPerLessonUsd?.toFixed(2)}`, { needsConfirmation: true, estimate });

  const mode = req.mode ?? 'full';
  const src = mode === 'audio_only' ? sourceGeneration(lessonId, req.sourceGenerationId) : undefined;
  const id = randomUUID();
  getDb()
    .insert(schema.generations)
    .values({ id, lessonId, mode, sourceGenerationId: src?.id ?? null, status: 'queued', configSnapshot: JSON.stringify(settings), estimatedCostUsd: estimate.usd })
    .run();
  enqueueJob(id);
  return { generationId: id, estimate };
}

export function retryGeneration(id: string) {
  const gen = getDb().select().from(schema.generations).where(eq(schema.generations.id, id)).get();
  if (!gen) throw new HttpError(404, 'Generation not found');
  if (gen.status !== 'failed') throw new HttpError(409, 'Only failed generations can be retried');
  const active = activeGenerationFor(gen.lessonId);
  if (active) throw new HttpError(409, 'Another generation for this lesson is running', { generationId: active.id });
  requeueGeneration(id);
  return { generationId: id };
}

export function getGenerationView(id: string) {
  const db = getDb();
  const gen = db.select().from(schema.generations).where(eq(schema.generations.id, id)).get();
  if (!gen) return null;
  const job = db.select().from(schema.generationJobs).where(eq(schema.generationJobs.generationId, id)).get();
  const usage = db.select().from(schema.generationUsage).where(eq(schema.generationUsage.generationId, id)).all();
  const validation = gen.validationJson ? JSON.parse(gen.validationJson) : null;
  if (validation) delete validation.script; // the script is exposed separately
  return {
    id: gen.id,
    lessonId: gen.lessonId,
    status: gen.status,
    mode: gen.mode,
    sourceGenerationId: gen.sourceGenerationId,
    hasScript: !!gen.scriptJson,
    hasAudio: gen.status === 'ready' && !!gen.audioPath,
    durationSeconds: gen.durationSeconds,
    errorMessage: gen.errorMessage,
    llm: gen.llmProvider ? `${gen.llmProvider} / ${gen.llmModel}` : null,
    tts: gen.ttsProvider ? `${gen.ttsProvider} / ${gen.ttsModel}` : null,
    createdAt: gen.createdAt,
    startedAt: gen.startedAt,
    completedAt: gen.completedAt,
    estimatedCostUsd: gen.estimatedCostUsd,
    job: job && { state: job.state, phase: job.currentPhase, progress: job.progress, message: job.message, retryCount: job.retryCount, lastError: job.lastError },
    usage: {
      llmInputTokens: usage.reduce((n, u) => n + (u.inputTokens ?? 0), 0),
      llmOutputTokens: usage.reduce((n, u) => n + (u.outputTokens ?? 0), 0),
      ttsCharacters: usage.reduce((n, u) => n + (u.characters ?? 0), 0),
      costUsd: usage.length && usage.every((u) => u.estimatedCostUsd != null) ? usage.reduce((n, u) => n + u.estimatedCostUsd!, 0) : null,
    },
    validation,
  };
}

export function listGenerations(lessonId: string) {
  return getDb()
    .select({ id: schema.generations.id })
    .from(schema.generations)
    .where(eq(schema.generations.lessonId, lessonId))
    .orderBy(desc(schema.generations.createdAt))
    .all()
    .map((r) => getGenerationView(r.id)!);
}

export function getScript(id: string) {
  const gen = getDb().select().from(schema.generations).where(eq(schema.generations.id, id)).get();
  return gen?.scriptJson ? JSON.parse(gen.scriptJson) : null;
}

/** Curriculum overview: each lesson with its latest generation status. */
export function lessonSummaries() {
  const db = getDb();
  const all = db.select().from(schema.generations).orderBy(desc(schema.generations.createdAt)).all();
  return loadCurriculum().lessons.map((l) => {
    const gens = all.filter((gn) => gn.lessonId === l.id);
    const latest = gens[0];
    const ready = gens.find((gn) => gn.status === 'ready');
    return {
      id: l.id,
      number: l.number,
      title: l.title,
      description: l.description,
      topic: l.topic,
      vocabularyFocus: l.vocabularyTargets.slice(0, 4).map((v) => v.japanese).join('・'),
      vocabularyCount: l.vocabularyTargets.length,
      grammarFocus: l.grammarTargets.map((gt) => gt.name).join('; '),
      estimatedMinutes: l.estimatedMinutes,
      status: latest ? latest.status : 'not_generated',
      readyGenerationId: ready?.id ?? null,
    };
  });
}
