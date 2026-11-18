import type { LessonContext } from '../curriculum/types';
import type { Settings } from '../config';
import type { AudioSegment, LessonScript, Speaker, SpeechRate } from '../script/schema';
import { estimateScriptSeconds } from '../script/duration';
import type { JsonRequest, LlmProvider } from './types';

/**
 * Deterministic stand-in for the LLM so the whole pipeline can be demonstrated and
 * tested without paid API calls. The output is structurally valid but pedagogically thin.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'mock-script-v1';
  constructor(private settings: Settings) {}

  async generateJson(req: JsonRequest) {
    const usage = { inputTokens: Math.round(req.user.length / 3), outputTokens: 0 };
    if (req.kind === 'review') return { data: { approved: true, issues: [] }, usage, stopReason: 'end_turn' };
    const data = buildMockScript(req.ctx, this.settings);
    usage.outputTokens = Math.round(JSON.stringify(data).length / 3);
    return { data, usage, stopReason: 'end_turn' };
  }
}

const JA_RUN = /([぀-ヿ一-鿿〜々ー、。！？「」（）]+)/;
const first = (s: string) => s.split('/')[0].replace(/〜/g, '').trim();

export function buildMockScript(ctx: LessonContext, settings: Settings): LessonScript {
  const { lesson } = ctx;
  const segs: AudioSegment[] = [];
  const counters: Record<number, number> = {};
  const add = (step: number, speaker: Speaker, language: 'ja-JP' | 'en', text: string, speechRate: SpeechRate, pauseAfterMs: number, translation = '') => {
    text = text.trim();
    if (!text) return;
    counters[step] = (counters[step] ?? 0) + 1;
    segs.push({
      id: `s${String(step).padStart(2, '0')}-${String(counters[step]).padStart(2, '0')}`,
      stepNumber: step,
      speaker,
      language,
      text,
      speechRate,
      pauseAfterMs,
      pronunciationNotes: '',
      transcript: { reading: language === 'ja-JP' ? text : '', romaji: '', translation: language === 'ja-JP' ? translation || '(mock translation)' : '', structuralTranslation: '', grammarNote: '' },
    });
  };
  /** Narrator explanation: English parts by the narrator, embedded Japanese as separate segments. */
  const explain = (step: number, text: string, pause = 900) => {
    for (const part of text.split(JA_RUN)) {
      if (!part.trim() || /^[、。（）\s]+$/.test(part)) continue;
      if (JA_RUN.test(part)) add(step, 'narrator', 'ja-JP', part, 'slow', 500);
      else add(step, 'narrator', 'en', part.replace(/[()]/g, ''), 'natural', pause);
    }
  };

  /** English meaning(s) of a word: one segment per alternative meaning, the last one carries the pause. */
  const gloss = (step: number, english: string, pause: number) => {
    const parts = english.split(/\s*[,/;]\s*/).map((p) => p.trim()).filter(Boolean);
    parts.forEach((p, i) => explain(step, p.charAt(0).toUpperCase() + p.slice(1) + '.', i === parts.length - 1 ? pause : 600));
  };

  const examples = lesson.grammarTargets.flatMap((g) => g.examples).filter((e) => !/[→—]/.test(e));
  const vocabLines = lesson.vocabularyTargets.map((v) => `${first(v.japanese)}。`);
  const dialogue = [...examples, ...vocabLines].slice(0, Math.max(settings.dialogueTurnsMin, Math.min(6, settings.dialogueTurnsMax)));
  const speakerAt = (i: number): Speaker => (i % 2 === 0 ? 'female' : 'male');

  dialogue.forEach((l, i) => add(1, speakerAt(i), 'ja-JP', l, 'natural', 600));
  add(2, 'narrator', 'en', `This is a short conversation about ${lesson.topic.toLowerCase()}.`, 'natural', 1000);
  explain(2, lesson.description, 1500);

  for (const v of lesson.vocabularyTargets) {
    add(3, 'female', 'ja-JP', first(v.japanese), 'slow', 800, v.english);
    gloss(3, v.english, 600);
    add(3, 'female', 'ja-JP', first(v.japanese), 'slow', 1200, v.english);
  }
  add(4, 'narrator', 'en', 'Now think of the Japanese silently before you hear it.', 'gentle', 1000);
  for (const v of lesson.vocabularyTargets) {
    gloss(4, v.english, 2500);
    add(4, 'male', 'ja-JP', first(v.japanese), 'slow', 500, v.english);
    add(4, 'male', 'ja-JP', first(v.japanese), 'natural', 1500, v.english);
  }
  for (const g of lesson.grammarTargets) {
    explain(5, `Let us look at the pattern ${g.name}.`, 800);
    explain(5, g.explanation);
  }
  dialogue.slice(0, 4).forEach((l, i) => {
    add(6, 'narrator', 'en', `Sentence ${i + 1}.`, 'natural', 600);
    add(6, 'female', 'ja-JP', l, 'slow', 1000);
    add(6, 'female', 'ja-JP', l, 'natural', 1500);
  });
  add(7, 'narrator', 'en', 'Listen to the same pattern with other words.', 'natural', 1000);
  examples.forEach((e) => add(7, 'male', 'ja-JP', e, 'medium', 1500));
  ctx.reviewVocabulary.forEach((v) => add(7, 'female', 'ja-JP', `${first(v.japanese)}。`, 'medium', 1200, v.english));
  examples.slice(0, 4).forEach((e) => {
    add(8, 'narrator', 'en', 'Think of the Japanese for the next sentence.', 'natural', 2500);
    add(8, 'female', 'ja-JP', e, 'medium', 800);
    add(8, 'female', 'ja-JP', e, 'natural', 1500);
  });
  dialogue.forEach((l, i) => add(9, speakerAt(i), 'ja-JP', l, 'medium', 700));
  dialogue.forEach((l, i) => add(10, speakerAt(i), 'ja-JP', l, 'natural', 600));
  [...dialogue].reverse().forEach((l, i) => add(11, speakerAt(i), 'ja-JP', l, 'natural', 700));
  dialogue.slice(0, 4).forEach((l, i) => add(12, speakerAt(i), 'ja-JP', l, 'gentle', 4000));

  // Pad with silence so the mock lesson roughly matches the target length.
  const deficit = settings.targetDurationMinutes * 60 - estimateScriptSeconds(segs, settings.speechSpeed).total;
  if (deficit > 0) {
    const extra = Math.round((deficit * 1000) / segs.length);
    for (const s of segs) s.pauseAfterMs = Math.min(15000, s.pauseAfterMs + extra);
  }

  return {
    title: lesson.title,
    situation: `Mock lesson: ${lesson.topic}`,
    characters: { female: { name: '佐藤', role: 'Mock character' }, male: { name: '田中', role: 'Mock character' } },
    coveredVocabularyIds: lesson.vocabularyTargets.map((v) => v.id),
    coveredGrammarIds: lesson.grammarTargets.map((g) => g.id),
    reviewedVocabularyIds: ctx.reviewVocabulary.map((v) => v.id),
    segments: segs,
  };
}
