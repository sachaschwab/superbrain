import { describe, expect, it } from 'vitest';
import { buildLessonContext, checkCurriculum, loadCurriculum } from '@/lib/curriculum';

describe('curriculum', () => {
  const c = loadCurriculum();

  it('has 20 valid, ordered lessons', () => {
    expect(c.lessons).toHaveLength(20);
    expect(c.lessons.map((l) => l.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(checkCurriculum(c)).toEqual([]);
  });

  it('gives every lesson 8–12 words, a primary grammar target and objectives', () => {
    for (const l of c.lessons) {
      expect(l.vocabularyTargets.length).toBeGreaterThanOrEqual(8);
      expect(l.vocabularyTargets.length).toBeLessThanOrEqual(12);
      expect(l.grammarTargets.some((g) => g.role === 'primary')).toBe(true);
      expect(l.objectives.length).toBeGreaterThan(0);
    }
  });

  it('rejects reviews that point forward', () => {
    const broken = structuredClone(c);
    broken.lessons[1].reviewVocabularyIds = ['v05-01'];
    expect(checkCurriculum(broken).join()).toMatch(/not from an earlier lesson/);
  });

  it('selects review material only from earlier lessons', () => {
    const ctx = buildLessonContext('ja-beginner-10');
    expect(ctx.reviewVocabulary.length).toBe(5);
    expect(ctx.priorVocabulary.length).toBeGreaterThan(90);
    for (const v of ctx.reviewVocabulary) expect(Number(v.id.slice(1, 3))).toBeLessThan(10);
    expect(buildLessonContext('ja-beginner-01').reviewVocabulary).toEqual([]);
  });
});
