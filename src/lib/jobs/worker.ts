import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import type { GenerationStatus } from '../db/schema';
import { runGeneration, type PipelineDeps } from '../pipeline';
import { safeErrorMessage } from '../retry';

/**
 * Persistent single-worker queue. Jobs live in SQLite, so a restart resumes them.
 * Limitation: one Node process only — it does not coordinate across multiple server instances
 * and does not run on serverless platforms where the process stops between requests.
 */
type WorkerState = { started: boolean; running: boolean; timer?: NodeJS.Timeout; deps: PipelineDeps };
const g = globalThis as unknown as { __superbrainWorker?: WorkerState };
const state: WorkerState = (g.__superbrainWorker ??= { started: false, running: false, deps: {} });

export const ACTIVE_STATUSES: GenerationStatus[] = ['queued', 'script_generation', 'script_validation', 'speech_synthesis', 'audio_assembly'];

export function startWorker(deps: PipelineDeps = {}) {
  state.deps = deps;
  if (state.started) return;
  state.started = true;
  const db = getDb();
  // Crash recovery: anything left "running" by a previous process goes back to the queue.
  db.update(schema.generationJobs).set({ state: 'queued', message: 'Resumed after restart', updatedAt: new Date() }).where(eq(schema.generationJobs.state, 'running')).run();
  state.timer = setInterval(() => void tick(), 3000);
  state.timer.unref?.();
  void tick();
}

export function stopWorker() {
  if (state.timer) clearInterval(state.timer);
  state.started = false;
}

export function kickWorker() {
  if (!state.started) startWorker();
  void tick();
}

/** Process queued jobs one at a time until the queue is empty. */
export async function tick() {
  if (state.running) return;
  state.running = true;
  try {
    for (;;) {
      const db = getDb();
      const job = db.select().from(schema.generationJobs).where(eq(schema.generationJobs.state, 'queued')).orderBy(asc(schema.generationJobs.createdAt)).get();
      if (!job) break;
      await runJob(job.id, job.generationId);
    }
  } finally {
    state.running = false;
  }
}

async function runJob(jobId: string, generationId: string) {
  const db = getDb();
  const setJob = (patch: Partial<typeof schema.generationJobs.$inferInsert>) =>
    db.update(schema.generationJobs).set({ ...patch, updatedAt: new Date() }).where(eq(schema.generationJobs.id, jobId)).run();
  const setStatus = (status: GenerationStatus) => db.update(schema.generations).set({ status }).where(eq(schema.generations.id, generationId)).run();

  setJob({ state: 'running', lastError: null });
  try {
    await runGeneration(
      generationId,
      (phase, progress, message) => {
        setJob({ currentPhase: phase, progress, message });
        setStatus(phase);
      },
      state.deps
    );
    setJob({ state: 'done', currentPhase: 'ready', progress: 1 });
  } catch (err) {
    const msg = safeErrorMessage(err);
    console.error(`[superbrain] generation ${generationId} failed:`, msg);
    setJob({ state: 'failed', currentPhase: 'failed', lastError: msg, message: 'Failed' });
    db.update(schema.generations).set({ status: 'failed', errorMessage: msg, completedAt: new Date() }).where(eq(schema.generations.id, generationId)).run();
  }
}

/** Create the job row for a generation (used by the service layer). */
export function enqueueJob(generationId: string) {
  getDb().insert(schema.generationJobs).values({ id: randomUUID(), generationId, state: 'queued', currentPhase: 'queued', progress: 0, message: 'Waiting in queue' }).run();
  kickWorker();
}

/** Re-queue a failed generation. Script and cached audio are kept, so it resumes rather than restarts. */
export function requeueGeneration(generationId: string) {
  const db = getDb();
  const job = db.select().from(schema.generationJobs).where(eq(schema.generationJobs.generationId, generationId)).get();
  db.update(schema.generations).set({ status: 'queued', errorMessage: null, completedAt: null }).where(eq(schema.generations.id, generationId)).run();
  if (job)
    db.update(schema.generationJobs)
      .set({ state: 'queued', currentPhase: 'queued', progress: 0, message: 'Retrying', retryCount: job.retryCount + 1, updatedAt: new Date() })
      .where(eq(schema.generationJobs.id, job.id))
      .run();
  else enqueueJob(generationId);
  kickWorker();
}

export function activeGenerationFor(lessonId: string) {
  return getDb()
    .select()
    .from(schema.generations)
    .where(and(eq(schema.generations.lessonId, lessonId), inArray(schema.generations.status, ACTIVE_STATUSES)))
    .get();
}

