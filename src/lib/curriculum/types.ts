import { z } from 'zod';

export const VocabularyTargetSchema = z.object({
  id: z.string().regex(/^v\d{2}-\d{2}$/),
  japanese: z.string().min(1),
  reading: z.string().min(1),
  romaji: z.string().min(1),
  english: z.string().min(1),
  partOfSpeech: z.string().min(1),
});

export const GrammarTargetSchema = z.object({
  id: z.string().regex(/^g\d{2}-\d$/),
  name: z.string().min(1),
  role: z.enum(['primary', 'related']),
  explanation: z.string().min(1),
  examples: z.array(z.object({ japanese: z.string().min(1), romaji: z.string().min(1), english: z.string().min(1) })).min(1),
});

export const CurriculumLessonSchema = z.object({
  id: z.string(),
  number: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  topic: z.string().min(1),
  objectives: z.array(z.string()).min(1),
  vocabularyTargets: z.array(VocabularyTargetSchema).min(1),
  grammarTargets: z.array(GrammarTargetSchema).min(1),
  reviewVocabularyIds: z.array(z.string()),
  reviewGrammarIds: z.array(z.string()),
  targetRegisters: z.array(z.enum(['casual', 'polite'])).min(1),
  estimatedMinutes: z.number().positive(),
  teachingNotes: z.string().default(''),
});

export const CurriculumSchema = z.object({
  id: z.string(),
  title: z.string(),
  targetLanguage: z.literal('ja-JP'),
  explanationLanguage: z.string(),
  version: z.number(),
  /** Romaji for Japanese snippets quoted in teaching notes. */
  romajiGlossary: z.record(z.string(), z.string()).default({}),
  lessons: z.array(CurriculumLessonSchema).min(1),
});

export type VocabularyTarget = z.infer<typeof VocabularyTargetSchema>;
export type GrammarTarget = z.infer<typeof GrammarTargetSchema>;
export type CurriculumLesson = z.infer<typeof CurriculumLessonSchema>;
export type Curriculum = z.infer<typeof CurriculumSchema>;

/** Everything the generator needs to know about a lesson and what came before it. */
export type LessonContext = {
  lesson: CurriculumLesson;
  reviewVocabulary: VocabularyTarget[];
  reviewGrammar: GrammarTarget[];
  /** All vocabulary introduced in earlier lessons (for 'known material' checks). */
  priorVocabulary: VocabularyTarget[];
  priorGrammar: GrammarTarget[];
};
