import { readFileSync } from 'node:fs';
import { CURRICULUM_PATH } from '../paths';
import { CurriculumSchema, type Curriculum, type CurriculumLesson, type LessonContext } from './types';

export * from './types';

/** Structural checks beyond the schema: unique ids, ordering, and that reviews point backwards. */
export function checkCurriculum(curriculum: Curriculum): string[] {
  const errors: string[] = [];
  const vocabLesson = new Map<string, number>();
  const grammarLesson = new Map<string, number>();
  const numbers = new Set<number>();

  for (const l of curriculum.lessons) {
    if (numbers.has(l.number)) errors.push(`Duplicate lesson number ${l.number}`);
    numbers.add(l.number);
    const nv = l.vocabularyTargets.length;
    if (nv < 8 || nv > 12) errors.push(`Lesson ${l.number}: ${nv} vocabulary targets (expected 8–12)`);
    if (!l.grammarTargets.some((g) => g.role === 'primary')) errors.push(`Lesson ${l.number}: no primary grammar target`);
    for (const v of l.vocabularyTargets) {
      if (vocabLesson.has(v.id)) errors.push(`Duplicate vocabulary id ${v.id}`);
      vocabLesson.set(v.id, l.number);
    }
    for (const g of l.grammarTargets) {
      if (grammarLesson.has(g.id)) errors.push(`Duplicate grammar id ${g.id}`);
      grammarLesson.set(g.id, l.number);
    }
  }
  for (const l of curriculum.lessons) {
    for (const id of l.reviewVocabularyIds) {
      const from = vocabLesson.get(id);
      if (from === undefined) errors.push(`Lesson ${l.number}: unknown review vocabulary ${id}`);
      else if (from >= l.number) errors.push(`Lesson ${l.number}: review vocabulary ${id} is not from an earlier lesson`);
    }
    for (const id of l.reviewGrammarIds) {
      const from = grammarLesson.get(id);
      if (from === undefined) errors.push(`Lesson ${l.number}: unknown review grammar ${id}`);
      else if (from >= l.number) errors.push(`Lesson ${l.number}: review grammar ${id} is not from an earlier lesson`);
    }
  }
  return errors;
}

let cached: Curriculum | null = null;

export function loadCurriculum(path = CURRICULUM_PATH): Curriculum {
  if (cached && path === CURRICULUM_PATH) return cached;
  const parsed = CurriculumSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  parsed.lessons.sort((a, b) => a.number - b.number);
  const errors = checkCurriculum(parsed);
  if (errors.length) throw new Error(`Invalid curriculum:\n- ${errors.join('\n- ')}`);
  if (path === CURRICULUM_PATH) cached = parsed;
  return parsed;
}

export function getLesson(id: string, curriculum = loadCurriculum()): CurriculumLesson | undefined {
  return curriculum.lessons.find((l) => l.id === id);
}

export function buildLessonContext(lessonId: string, curriculum = loadCurriculum()): LessonContext {
  const lesson = getLesson(lessonId, curriculum);
  if (!lesson) throw new Error(`Unknown lesson ${lessonId}`);
  const earlier = curriculum.lessons.filter((l) => l.number < lesson.number);
  const priorVocabulary = earlier.flatMap((l) => l.vocabularyTargets);
  const priorGrammar = earlier.flatMap((l) => l.grammarTargets);
  const byV = new Map(priorVocabulary.map((v) => [v.id, v]));
  const byG = new Map(priorGrammar.map((g) => [g.id, g]));
  return {
    lesson,
    reviewVocabulary: lesson.reviewVocabularyIds.map((id) => byV.get(id)!).filter(Boolean),
    reviewGrammar: lesson.reviewGrammarIds.map((id) => byG.get(id)!).filter(Boolean),
    priorVocabulary,
    priorGrammar,
  };
}
