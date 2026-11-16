import type { Settings } from '../config';
import type { LessonContext } from '../curriculum/types';
import type { LlmProvider, LlmUsage } from '../llm/types';
import { lessonScriptJsonSchema, reviewJsonSchema, ReviewResultSchema, type LessonScript, type ReviewIssue } from './schema';
import { correctionPrompt, lessonPrompt, reviewPrompt, reviewSystemPrompt, systemPrompt } from './prompt';
import { validateScript, type Issue, type ValidationResult } from './validate';

export type ScriptOutcome = {
  script: LessonScript;
  validation: ValidationResult & { reviewIssues: ReviewIssue[]; correctionRounds: number };
  usage: LlmUsage[];
};

export class ScriptValidationError extends Error {
  constructor(
    message: string,
    readonly lastScript: unknown,
    readonly errors: Issue[],
    readonly reviewIssues: ReviewIssue[],
    readonly usage: LlmUsage[]
  ) {
    super(message);
  }
}

type Progress = (phase: 'script_generation' | 'script_validation', message: string) => void;

const SCRIPT_MAX_TOKENS = 64000;

/** Phase B + C: generate the structured script, validate it, and request targeted corrections. */
export async function generateValidatedScript(ctx: LessonContext, settings: Settings, llm: LlmProvider, progress: Progress = () => {}): Promise<ScriptOutcome> {
  const usage: LlmUsage[] = [];
  const system = systemPrompt(settings);

  progress('script_generation', `Writing the lesson script with ${llm.model}…`);
  let res = await llm.generateJson({ kind: 'script', system, user: lessonPrompt(ctx, settings), schema: lessonScriptJsonSchema, maxTokens: SCRIPT_MAX_TOKENS, ctx });
  usage.push(res.usage);
  let data = res.data;

  const maxRounds = settings.llm.maxCorrectionRounds;
  let reviewIssues: ReviewIssue[] = [];

  for (let round = 0; ; round++) {
    progress('script_validation', round === 0 ? 'Checking structure, coverage and timing…' : `Re-checking corrected script (round ${round})…`);
    const v = validateScript(data, ctx, settings);

    if (!v.ok) {
      if (round >= maxRounds)
        throw new ScriptValidationError(`Script failed validation after ${round} correction round(s): ${v.errors.map((e) => e.message).slice(0, 5).join('; ')}`, data, v.errors, [], usage);
      progress('script_validation', `Fixing ${v.errors.length} structural problem(s)…`);
      res = await llm.generateJson({ kind: 'correction', system, user: correctionPrompt(data, v.errors), schema: lessonScriptJsonSchema, maxTokens: SCRIPT_MAX_TOKENS, ctx });
      usage.push(res.usage);
      data = res.data;
      continue;
    }

    if (settings.llm.linguisticReview && llm.name !== 'mock') {
      progress('script_validation', 'Linguistic review of Japanese, translations and register…');
      const r = await llm.generateJson({ kind: 'review', system: reviewSystemPrompt(), user: reviewPrompt(v.script!, ctx), schema: reviewJsonSchema, maxTokens: 16000, ctx });
      usage.push(r.usage);
      const review = ReviewResultSchema.parse(r.data);
      reviewIssues = review.issues;
      const blocking = review.issues.filter((i) => i.severity === 'error');
      if (blocking.length) {
        if (round >= maxRounds)
          throw new ScriptValidationError(`Linguistic review still found ${blocking.length} error(s) after ${round} correction round(s): ${blocking.map((i) => i.problem).slice(0, 3).join('; ')}`, data, [], blocking, usage);
        progress('script_validation', `Correcting ${blocking.length} linguistic issue(s)…`);
        res = await llm.generateJson({ kind: 'correction', system, user: correctionPrompt(data, [], blocking), schema: lessonScriptJsonSchema, maxTokens: SCRIPT_MAX_TOKENS, ctx });
        usage.push(res.usage);
        data = res.data;
        continue;
      }
    }

    return { script: v.script!, validation: { ...v, reviewIssues, correctionRounds: round }, usage };
  }
}
