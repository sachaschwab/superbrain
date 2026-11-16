import { z } from 'zod';

/**
 * Central lesson-generation configuration (spec §4). Persisted in the settings table;
 * these are the defaults. API keys are never part of this object.
 */
export const SettingsSchema = z.object({
  targetLanguage: z.literal('ja-JP').default('ja-JP'),
  explanationLanguage: z.string().min(2).default('en'),
  level: z.literal('beginner').default('beginner'),
  learningMode: z.literal('analytical-passive').default('analytical-passive'),

  targetDurationMinutes: z.number().min(5).max(40).default(18),
  newVocabularyMin: z.number().int().min(3).max(20).default(8),
  newVocabularyMax: z.number().int().min(3).max(20).default(12),
  primaryGrammarPatterns: z.number().int().min(1).max(2).default(1),
  optionalRelatedGrammarPatterns: z.number().int().min(0).max(2).default(1),
  grammarDepth: z.enum(['light', 'standard', 'deep']).default('standard'),
  dialogueTurnsMin: z.number().int().min(2).max(12).default(5),
  dialogueTurnsMax: z.number().int().min(2).max(14).default(7),

  includeCasualSpeech: z.boolean().default(true),
  includePoliteSpeech: z.boolean().default(true),
  enableStructuralTranslation: z.boolean().default(true),
  enableGrammarAnalysis: z.boolean().default(true),
  enablePatternVariations: z.boolean().default(true),
  enableMentalRetrieval: z.boolean().default(true),
  endWithRelaxedListening: z.boolean().default(true),
  includePreviousLessonReview: z.boolean().default(true),
  reviewIntensity: z.enum(['light', 'standard', 'strong']).default('standard'),

  /** Global multiplier on top of each segment's speech rate (0.7–1.2, ElevenLabs range). */
  speechSpeed: z.number().min(0.7).max(1.2).default(1),

  voices: z
    .object({
      female: z.string().min(1).default('EXAVITQu4vr4xnSDxMaL'),
      male: z.string().min(1).default('pNInz6obpgDQGcFmaJgB'),
      narrator: z.string().min(1).default('JBFqnCBsd6RMkjVDRZzb'),
      /** Voice for Japanese example sentences spoken by the narrator. Empty = use the female voice. */
      narratorJapanese: z.string().default(''),
    })
    .default({ female: 'EXAVITQu4vr4xnSDxMaL', male: 'pNInz6obpgDQGcFmaJgB', narrator: 'JBFqnCBsd6RMkjVDRZzb', narratorJapanese: '' }),

  llm: z
    .object({
      provider: z.enum(['anthropic', 'mock']).default('anthropic'),
      model: z.string().min(1).default('claude-sonnet-5-5'),
      /** Second LLM pass checking grammar, translations and register. */
      linguisticReview: z.boolean().default(true),
      maxCorrectionRounds: z.number().int().min(0).max(4).default(2),
    })
    .default({ provider: 'anthropic', model: 'claude-sonnet-5-5', linguisticReview: true, maxCorrectionRounds: 2 }),

  tts: z
    .object({
      provider: z.enum(['elevenlabs', 'mock']).default('elevenlabs'),
      model: z.string().min(1).default('eleven_multilingual_v2'),
    })
    .default({ provider: 'elevenlabs', model: 'eleven_multilingual_v2' }),

  /** Prices are user-supplied; null means "unknown" and costs are shown as usage only. */
  pricing: z
    .object({
      llmInputPerMTokUsd: z.number().min(0).nullable().default(null),
      llmOutputPerMTokUsd: z.number().min(0).nullable().default(null),
      ttsPer1kCharsUsd: z.number().min(0).nullable().default(null),
    })
    .default({ llmInputPerMTokUsd: null, llmOutputPerMTokUsd: null, ttsPer1kCharsUsd: null }),
  maxEstimatedCostPerLessonUsd: z.number().min(0).nullable().default(null),
});

export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  const s = SettingsSchema.parse({});
  // Environment provides first-run defaults; the settings screen can change them afterwards.
  if (process.env.LLM_PROVIDER === 'mock' || process.env.LLM_PROVIDER === 'anthropic') s.llm.provider = process.env.LLM_PROVIDER;
  if (process.env.ANTHROPIC_MODEL) s.llm.model = process.env.ANTHROPIC_MODEL;
  if (process.env.TTS_PROVIDER === 'mock' || process.env.TTS_PROVIDER === 'elevenlabs') s.tts.provider = process.env.TTS_PROVIDER;
  if (process.env.ELEVENLABS_MODEL) s.tts.model = process.env.ELEVENLABS_MODEL;
  return s;
}

/** The 12-step schema (spec §6). Durations are targets, not requirements. */
export const STEPS = [
  { number: 1, name: 'First exposure dialogue', targetSeconds: 60 },
  { number: 2, name: 'Context and meaning', targetSeconds: 45 },
  { number: 3, name: 'Vocabulary recognition', targetSeconds: 120 },
  { number: 4, name: 'Vocabulary anticipation', targetSeconds: 90 },
  { number: 5, name: 'Structural deep dive', targetSeconds: 150 },
  { number: 6, name: 'Sentence decomposition', targetSeconds: 180 },
  { number: 7, name: 'Pattern variation', targetSeconds: 120 },
  { number: 8, name: 'Guided anticipation', targetSeconds: 90 },
  { number: 9, name: 'Conversation replay', targetSeconds: 60 },
  { number: 10, name: 'Natural conversation', targetSeconds: 60 },
  { number: 11, name: 'Contextual transfer', targetSeconds: 60 },
  { number: 12, name: 'Relaxed consolidation', targetSeconds: 60 },
] as const;

/** Scale the step targets to the configured total duration. */
export function stepTargets(settings: Settings) {
  const base = STEPS.reduce((s, x) => s + x.targetSeconds, 0); // 1065 s ≈ 17.75 min
  const k = (settings.targetDurationMinutes * 60) / base;
  return STEPS.map((s) => ({ ...s, targetSeconds: Math.round(s.targetSeconds * k) }));
}
