import { z } from 'zod';

export const SPEAKERS = ['female', 'male', 'narrator'] as const;
export const LANGUAGES = ['ja-JP', 'en'] as const;
export const SPEECH_RATES = ['slow', 'medium', 'natural', 'gentle'] as const;

export type Speaker = (typeof SPEAKERS)[number];
export type SegmentLanguage = (typeof LANGUAGES)[number];
export type SpeechRate = (typeof SPEECH_RATES)[number];

/** Transcript-only data. Never sent to speech synthesis. */
export const TranscriptFieldsSchema = z.object({
  reading: z.string(), // kana reading for Japanese segments, '' for English
  romaji: z.string(), // Hepburn with long-vowel marks, '' for English
  translation: z.string(), // natural English, '' for English segments
  structuralTranslation: z.string(), // word-order gloss where relevant, else ''
  grammarNote: z.string(), // short note, else ''
});

export const AudioSegmentSchema = z.object({
  id: z.string().min(1),
  stepNumber: z.number().int().min(1).max(12),
  speaker: z.enum(SPEAKERS),
  language: z.enum(LANGUAGES),
  text: z.string().min(1),
  speechRate: z.enum(SPEECH_RATES),
  pauseAfterMs: z.number().int().min(0).max(15000),
  pronunciationNotes: z.string(),
  transcript: TranscriptFieldsSchema,
});

export const CharacterSchema = z.object({ name: z.string().min(1), role: z.string().min(1) });

export const LessonScriptSchema = z.object({
  title: z.string().min(1),
  situation: z.string().min(1),
  characters: z.object({ female: CharacterSchema, male: CharacterSchema }),
  coveredVocabularyIds: z.array(z.string()),
  coveredGrammarIds: z.array(z.string()),
  reviewedVocabularyIds: z.array(z.string()),
  segments: z.array(AudioSegmentSchema).min(12),
});

export type AudioSegment = z.infer<typeof AudioSegmentSchema>;
export type LessonScript = z.infer<typeof LessonScriptSchema>;

// ---- JSON Schemas for Anthropic structured outputs -------------------------
// Hand-written (rather than converted) so they respect the structured-output rules:
// additionalProperties:false everywhere, every property required, no min/max keywords.

const str = (description: string) => ({ type: 'string', description });

const transcriptJson = {
  type: 'object',
  additionalProperties: false,
  required: ['reading', 'romaji', 'translation', 'structuralTranslation', 'grammarNote'],
  properties: {
    reading: str('Kana reading of a Japanese segment. Empty string for English segments.'),
    romaji: str('Hepburn romanisation with long vowels marked (ō, ū). Empty string for English segments.'),
    translation: str('Natural English translation of a Japanese segment. Empty string for English segments.'),
    structuralTranslation: str('Analytical gloss in Japanese word order (Step 6 especially). Empty string if not relevant.'),
    grammarNote: str('Short grammar note for the transcript. Empty string if none.'),
  },
};

const segmentJson = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'stepNumber', 'speaker', 'language', 'text', 'speechRate', 'pauseAfterMs', 'pronunciationNotes', 'transcript'],
  properties: {
    id: str('Unique id, e.g. "s01-03" (step 1, segment 3).'),
    stepNumber: { type: 'integer', description: 'Step 1–12.' },
    speaker: { type: 'string', enum: [...SPEAKERS] },
    language: { type: 'string', enum: [...LANGUAGES] },
    text: str('Exactly what the voice says. Japanese in kana/kanji (never romaji); English with no Japanese script. No stage directions.'),
    speechRate: { type: 'string', enum: [...SPEECH_RATES] },
    pauseAfterMs: { type: 'integer', description: 'Silence after this segment in milliseconds (0–15000).' },
    pronunciationNotes: str('Optional note for a human reviewer (e.g. devoiced vowel, long vowel). Not spoken. Empty string if none.'),
    transcript: transcriptJson,
  },
};

const character = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'role'],
  properties: { name: str('Japanese name as written, e.g. 田中'), role: str('Short English description') },
};

export const lessonScriptJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'situation', 'characters', 'coveredVocabularyIds', 'coveredGrammarIds', 'reviewedVocabularyIds', 'segments'],
  properties: {
    title: str('Lesson title in English.'),
    situation: str('One-sentence English description of the dialogue situation.'),
    characters: {
      type: 'object',
      additionalProperties: false,
      required: ['female', 'male'],
      properties: { female: character, male: character },
    },
    coveredVocabularyIds: { type: 'array', items: { type: 'string' }, description: 'Curriculum vocabulary ids used.' },
    coveredGrammarIds: { type: 'array', items: { type: 'string' }, description: 'Curriculum grammar ids taught.' },
    reviewedVocabularyIds: { type: 'array', items: { type: 'string' }, description: 'Review vocabulary ids reused.' },
    segments: { type: 'array', items: segmentJson },
  },
} as const;

export const ReviewIssueSchema = z.object({
  segmentId: z.string(),
  severity: z.enum(['error', 'warning']),
  category: z.enum(['grammar', 'translation', 'register', 'naturalness', 'pedagogy', 'pronunciation', 'other']),
  problem: z.string(),
  suggestedFix: z.string(),
});
export const ReviewResultSchema = z.object({ approved: z.boolean(), issues: z.array(ReviewIssueSchema) });
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

export const reviewJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['approved', 'issues'],
  properties: {
    approved: { type: 'boolean', description: 'true if there are no error-severity issues.' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['segmentId', 'severity', 'category', 'problem', 'suggestedFix'],
        properties: {
          segmentId: str('Segment id, or "global".'),
          severity: { type: 'string', enum: ['error', 'warning'] },
          category: { type: 'string', enum: ['grammar', 'translation', 'register', 'naturalness', 'pedagogy', 'pronunciation', 'other'] },
          problem: str('What is wrong.'),
          suggestedFix: str('Concrete correction.'),
        },
      },
    },
  },
} as const;
