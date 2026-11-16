import type { LessonContext } from '../curriculum/types';
import type { Settings } from '../config';
import { stepTargets } from '../config';
import { LessonScriptSchema, type AudioSegment, type LessonScript } from './schema';
import { estimateScriptSeconds } from './duration';

export type Issue = { code: string; message: string; segmentId?: string; step?: number };
export type ValidationResult = {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  stats: { segments: number; estimatedSeconds: number; perStepSeconds: Record<number, number>; ttsCharacters: number };
};

const JAPANESE = /[぀-ヿ一-鿿]/;
// Stage directions / markup that must never be spoken.
const DIRECTION = /[\[\]<>{}*#_]|\((?:pause|silence|laugh|sigh|beat)[^)]*\)|（[^）]*(?:間|ポーズ)[^）]*）|\bpause\b|\bsilence\b/i;

const DIALOGUE_STEPS = new Set([1, 9, 10, 11]);
const NARRATOR_STEPS = new Set([2, 5]);

/** Normalise Japanese for comparisons: drop punctuation, whitespace and speaker-neutral marks. */
export const normJa = (s: string) => s.replace(/[\s、。！？!?「」『』…・〜ー—\-.,]/g, '');

function stepSegments(segments: AudioSegment[], step: number) {
  return segments.filter((s) => s.stepNumber === step);
}

function sameDialogue(a: AudioSegment[], b: AudioSegment[]) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.speaker === b[i].speaker && normJa(x.text) === normJa(b[i].text));
}

/** Deterministic checks (spec §9 Phase C). Linguistic judgement is a separate LLM pass. */
export function validateScript(raw: unknown, ctx: LessonContext, settings: Settings): ValidationResult & { script?: LessonScript } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const empty = { segments: 0, estimatedSeconds: 0, perStepSeconds: {}, ttsCharacters: 0 };

  const parsed = LessonScriptSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 25)) errors.push({ code: 'schema', message: `${i.path.join('.')}: ${i.message}` });
    return { ok: false, errors, warnings, stats: empty };
  }
  const script = parsed.data;
  const segs = script.segments;

  // Unique ids
  const ids = new Set<string>();
  for (const s of segs) {
    if (ids.has(s.id)) errors.push({ code: 'duplicate-id', message: `Duplicate segment id ${s.id}`, segmentId: s.id });
    ids.add(s.id);
  }

  // All 12 steps, in order
  for (let n = 1; n <= 12; n++) {
    if (!segs.some((s) => s.stepNumber === n)) errors.push({ code: 'missing-step', message: `Step ${n} is missing`, step: n });
  }
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].stepNumber < segs[i - 1].stepNumber) {
      errors.push({ code: 'step-order', message: `Segment ${segs[i].id} (step ${segs[i].stepNumber}) comes after step ${segs[i - 1].stepNumber}`, segmentId: segs[i].id });
      break;
    }
  }

  // Per-segment language, speaker and text hygiene
  for (const s of segs) {
    const where = { segmentId: s.id, step: s.stepNumber };
    if (s.language === 'ja-JP' && !JAPANESE.test(s.text))
      errors.push({ code: 'ja-no-script', message: `${s.id}: Japanese segment has no kana/kanji (romaji must never be synthesised)`, ...where });
    if (s.language === 'en' && JAPANESE.test(s.text))
      errors.push({ code: 'en-has-japanese', message: `${s.id}: English segment contains Japanese script — split it into a separate ja-JP segment`, ...where });
    if (DIRECTION.test(s.text))
      errors.push({ code: 'stage-direction', message: `${s.id}: text contains a production instruction or markup: "${s.text.slice(0, 60)}"`, ...where });
    if (DIALOGUE_STEPS.has(s.stepNumber) && (s.speaker === 'narrator' || s.language !== 'ja-JP'))
      errors.push({ code: 'dialogue-speaker', message: `${s.id}: step ${s.stepNumber} must be Japanese dialogue between the female and male speakers`, ...where });
    if (NARRATOR_STEPS.has(s.stepNumber) && s.language === 'en' && s.speaker !== 'narrator')
      errors.push({ code: 'narrator-speaker', message: `${s.id}: English explanation in step ${s.stepNumber} must be spoken by the narrator`, ...where });
    if (s.language === 'en' && s.speaker !== 'narrator')
      errors.push({ code: 'en-speaker', message: `${s.id}: English is spoken only by the narrator`, ...where });
    if (s.language === 'ja-JP' && !s.transcript.translation && s.stepNumber !== 12)
      warnings.push({ code: 'missing-translation', message: `${s.id}: Japanese segment has no transcript translation`, ...where });
  }

  // Dialogue turn count
  const step1 = stepSegments(segs, 1);
  if (step1.length && (step1.length < settings.dialogueTurnsMin || step1.length > settings.dialogueTurnsMax + 2))
    warnings.push({ code: 'dialogue-turns', message: `Step 1 has ${step1.length} turns (target ${settings.dialogueTurnsMin}–${settings.dialogueTurnsMax})`, step: 1 });
  if (step1.length && (!step1.some((s) => s.speaker === 'female') || !step1.some((s) => s.speaker === 'male')))
    errors.push({ code: 'dialogue-two-speakers', message: 'Step 1 needs both the female and the male speaker', step: 1 });

  // Steps 9 and 10 replay the exact Step 1 script
  for (const n of [9, 10]) {
    const replay = stepSegments(segs, n);
    if (replay.length && step1.length && !sameDialogue(step1, replay))
      errors.push({ code: 'replay-mismatch', message: `Step ${n} must replay the exact Step 1 dialogue (same speakers, same text, same order)`, step: n });
  }
  if (stepSegments(segs, 10).some((s) => s.speechRate !== 'natural'))
    warnings.push({ code: 'step10-rate', message: 'Step 10 should use natural speech rate', step: 10 });
  if (stepSegments(segs, 9).some((s) => s.speechRate === 'natural'))
    warnings.push({ code: 'step9-rate', message: 'Step 9 should be slightly slower than natural (medium)', step: 9 });

  // Anticipation steps need real thinking pauses
  for (const n of [4, 8]) {
    const stepSegs = stepSegments(segs, n);
    if (stepSegs.length && !stepSegs.some((s) => s.language === 'en' && s.pauseAfterMs >= 2000))
      errors.push({ code: 'anticipation-pause', message: `Step ${n} needs English prompts followed by pauses of at least 2000 ms`, step: n });
  }

  // Step 12: Japanese only, nothing new
  const earlierJa = segs.filter((s) => s.stepNumber < 12 && s.language === 'ja-JP').map((s) => normJa(s.text));
  for (const s of stepSegments(segs, 12)) {
    if (s.language !== 'ja-JP')
      errors.push({ code: 'step12-english', message: `${s.id}: Step 12 must contain no English`, segmentId: s.id, step: 12 });
    else if (!earlierJa.some((e) => e.includes(normJa(s.text))))
      errors.push({ code: 'step12-new-material', message: `${s.id}: Step 12 phrase "${s.text}" does not appear earlier in the lesson — Step 12 may only replay familiar language`, segmentId: s.id, step: 12 });
  }

  // Curriculum coverage: every target word must be spoken in Japanese, ideally in ≥2 steps
  const jaSegs = segs.filter((s) => s.language === 'ja-JP');
  const minCoverage = Math.min(settings.newVocabularyMin, ctx.lesson.vocabularyTargets.length);
  let covered = 0;
  for (const v of ctx.lesson.vocabularyTargets) {
    const forms = vocabForms(v.japanese, v.reading);
    const steps = new Set(jaSegs.filter((s) => forms.some((f) => normJa(s.text).includes(f))).map((s) => s.stepNumber));
    if (steps.size === 0) warnings.push({ code: 'vocab-missing', message: `Vocabulary ${v.id} ${v.japanese} is never spoken` });
    else {
      covered++;
      if (steps.size < 2) warnings.push({ code: 'vocab-repetition', message: `Vocabulary ${v.id} ${v.japanese} appears in only one step (distributed repetition wants ≥2)` });
    }
  }
  if (covered < minCoverage)
    errors.push({ code: 'vocab-coverage', message: `Only ${covered} of ${ctx.lesson.vocabularyTargets.length} target vocabulary items are spoken (minimum ${minCoverage})` });

  for (const g of ctx.lesson.grammarTargets.filter((g) => g.role === 'primary')) {
    if (!script.coveredGrammarIds.includes(g.id))
      errors.push({ code: 'grammar-coverage', message: `Primary grammar ${g.id} (${g.name}) is not listed as covered` });
  }

  // Review material
  if (settings.includePreviousLessonReview && ctx.reviewVocabulary.length) {
    const reused = ctx.reviewVocabulary.filter((v) => {
      const forms = vocabForms(v.japanese, v.reading);
      return jaSegs.some((s) => forms.some((f) => normJa(s.text).includes(f)));
    });
    const need = settings.reviewIntensity === 'light' ? 1 : settings.reviewIntensity === 'strong' ? Math.ceil(ctx.reviewVocabulary.length * 0.8) : Math.ceil(ctx.reviewVocabulary.length / 2);
    if (reused.length < need)
      errors.push({ code: 'review-coverage', message: `Only ${reused.length} review words reused (need ${need}): missing ${ctx.reviewVocabulary.filter((v) => !reused.includes(v)).map((v) => v.japanese).join(', ')}` });
  }

  // Duration
  const { total, perStep } = estimateScriptSeconds(segs, settings.speechSpeed);
  const target = settings.targetDurationMinutes * 60;
  if (total < target * 0.6 || total > target * 1.5)
    errors.push({ code: 'duration', message: `Estimated duration ${(total / 60).toFixed(1)} min is far from the ${settings.targetDurationMinutes} min target` });
  else if (total < target * 0.85 || total > target * 1.15)
    warnings.push({ code: 'duration', message: `Estimated duration ${(total / 60).toFixed(1)} min is outside ±15% of ${settings.targetDurationMinutes} min (estimate is approximate)` });
  for (const t of stepTargets(settings)) {
    const sec = perStep[t.number] ?? 0;
    if (sec > t.targetSeconds * 2.2) warnings.push({ code: 'step-duration', message: `Step ${t.number} ~${Math.round(sec)}s vs target ${t.targetSeconds}s`, step: t.number });
  }

  const ttsCharacters = segs.reduce((n, s) => n + s.text.length, 0);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    script,
    stats: { segments: segs.length, estimatedSeconds: Math.round(total), perStepSeconds: perStep, ttsCharacters },
  };
}

/** Forms of a vocabulary item to search for: written form(s) and reading, minus affix markers. */
export function vocabForms(japanese: string, reading: string): string[] {
  const parts = [...japanese.split('/'), ...reading.split('/')]
    .map((p) => normJa(p.replace(/〜/g, '')))
    .filter((p) => p.length > 0);
  // Verbs: also accept the stem (e.g. 食べます → 食べ) so ました/ません/て forms count.
  const stems = parts.filter((p) => p.endsWith('ます')).map((p) => p.slice(0, -2)).filter((p) => p.length > 0);
  return [...new Set([...parts, ...stems])];
}
