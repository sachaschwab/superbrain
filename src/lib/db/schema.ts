import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

const now = () => new Date();

/** Curriculum lessons, synced from data/curriculum/*.json on startup. */
export const lessons = sqliteTable('lessons', {
  id: text('id').primaryKey(),
  number: integer('number').notNull().unique(),
  title: text('title').notNull(),
  curriculumJson: text('curriculum_json').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
});

export const vocabularyItems = sqliteTable('vocabulary_items', {
  id: text('id').primaryKey(),
  japanese: text('japanese').notNull(),
  reading: text('reading').notNull(),
  english: text('english').notNull(),
  firstLessonId: text('first_lesson_id').notNull().references(() => lessons.id),
});

export const grammarPatterns = sqliteTable('grammar_patterns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  explanation: text('explanation').notNull(),
  firstLessonId: text('first_lesson_id').notNull().references(() => lessons.id),
});

export const GENERATION_STATUSES = [
  'queued',
  'script_generation',
  'script_validation',
  'speech_synthesis',
  'audio_assembly',
  'ready',
  'failed',
] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

/** One attempt at producing a lesson (script + audio). Never deleted on regeneration. */
export const generations = sqliteTable(
  'generations',
  {
    id: text('id').primaryKey(),
    lessonId: text('lesson_id').notNull().references(() => lessons.id),
    status: text('status').$type<GenerationStatus>().notNull().default('queued'),
    /** 'full' = new script + audio; 'audio_only' = reuse script from sourceGenerationId. */
    mode: text('mode').$type<'full' | 'audio_only'>().notNull().default('full'),
    sourceGenerationId: text('source_generation_id'),
    scriptJson: text('script_json'),
    validationJson: text('validation_json'),
    configSnapshot: text('config_snapshot').notNull(),
    llmProvider: text('llm_provider'),
    llmModel: text('llm_model'),
    ttsProvider: text('tts_provider'),
    ttsModel: text('tts_model'),
    audioPath: text('audio_path'),
    transcriptPath: text('transcript_path'),
    durationSeconds: real('duration_seconds'),
    estimatedCostUsd: real('estimated_cost_usd'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('generations_lesson_idx').on(t.lessonId)]
);

/** Persistent background job driving one generation through its phases. */
export const generationJobs = sqliteTable('generation_jobs', {
  id: text('id').primaryKey(),
  generationId: text('generation_id').notNull().references(() => generations.id),
  state: text('state').$type<'queued' | 'running' | 'done' | 'failed'>().notNull().default('queued'),
  currentPhase: text('current_phase').$type<GenerationStatus>().notNull().default('queued'),
  progress: real('progress').notNull().default(0),
  message: text('message'),
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
});

export const generationUsage = sqliteTable('generation_usage', {
  id: text('id').primaryKey(),
  generationId: text('generation_id').notNull().references(() => generations.id),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  kind: text('kind').$type<'llm' | 'tts'>().notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  characters: integer('characters'),
  /** Null when no price is configured — we never invent provider pricing. */
  estimatedCostUsd: real('estimated_cost_usd'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
});

/** 1–3 = Leitner piles, 4 = learned (out of the rotation). */
export const FLASHCARD_PILES = [1, 2, 3, 4] as const;

export const flashcards = sqliteTable(
  'flashcards',
  {
    id: text('id').primaryKey(),
    /** vocab:<vocabId> or phrase:<normalised Japanese> — lets the same item be toggled from anywhere. */
    key: text('key').notNull().unique(),
    kind: text('kind').$type<'vocab' | 'phrase'>().notNull(),
    japanese: text('japanese').notNull(),
    reading: text('reading').notNull().default(''),
    romaji: text('romaji').notNull().default(''),
    english: text('english').notNull(),
    lessonId: text('lesson_id'),
    vocabId: text('vocab_id'),
    /** For phrases taken from a transcript: reuse that exact recording. */
    generationId: text('generation_id'),
    segmentId: text('segment_id'),
    pile: integer('pile').notNull().default(1),
    reviewCount: integer('review_count').notNull().default(0),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
  },
  (t) => [index('flashcards_pile_idx').on(t.pile)]
);
