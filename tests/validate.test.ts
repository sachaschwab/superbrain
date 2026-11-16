import { describe, expect, it } from 'vitest';
import { buildLessonContext } from '@/lib/curriculum';
import { buildMockScript } from '@/lib/llm/mock';
import { validateScript, vocabForms } from '@/lib/script/validate';
import { estimateSpeechSeconds } from '@/lib/script/duration';
import type { LessonScript } from '@/lib/script/schema';
import { mockSettings } from './helpers';

const settings = mockSettings();
const ctx = buildLessonContext('ja-beginner-07');
const good = () => buildMockScript(ctx, settings);
const codes = (s: unknown) => validateScript(s, ctx, settings).errors.map((e) => e.code);

describe('script validation', () => {
  it('accepts a well-formed script for every lesson', () => {
    for (let n = 1; n <= 20; n++) {
      const c = buildLessonContext(`ja-beginner-${String(n).padStart(2, '0')}`);
      const r = validateScript(buildMockScript(c, settings), c, settings);
      expect(r.errors, `lesson ${n}`).toEqual([]);
    }
  });

  it('rejects malformed JSON shape', () => {
    expect(codes({ title: 'x' })).toContain('schema');
  });

  it('requires all 12 steps in order', () => {
    const s = good();
    s.segments = s.segments.filter((x) => x.stepNumber !== 6);
    expect(codes(s)).toContain('missing-step');
    const t = good();
    [t.segments[0], t.segments[t.segments.length - 1]] = [t.segments[t.segments.length - 1], t.segments[0]];
    expect(codes(t)).toContain('step-order');
  });

  it('keeps languages and speakers apart', () => {
    const s = good();
    const en = s.segments.find((x) => x.language === 'en')!;
    en.text = 'The word is 食べます.';
    expect(codes(s)).toContain('en-has-japanese');

    const r = good();
    r.segments.find((x) => x.language === 'ja-JP')!.text = 'tabemasu';
    expect(codes(r)).toContain('ja-no-script');

    const d = good();
    d.segments.find((x) => x.stepNumber === 1)!.speaker = 'narrator';
    expect(codes(d)).toContain('dialogue-speaker');
  });

  it('rejects production instructions in spoken text', () => {
    const s = good();
    s.segments.find((x) => x.language === 'en')!.text = 'Listen. (pause) Now repeat.';
    expect(codes(s)).toContain('stage-direction');
  });

  it('requires steps 9 and 10 to replay step 1 exactly', () => {
    const s = good();
    s.segments.find((x) => x.stepNumber === 9)!.text = '違う文です。';
    expect(codes(s)).toContain('replay-mismatch');
  });

  it('forbids new material and English in step 12', () => {
    const s = good();
    s.segments.find((x) => x.stepNumber === 12)!.text = '新しい言葉が出ます。';
    expect(codes(s)).toContain('step12-new-material');
    const t = good();
    const seg = t.segments.find((x) => x.stepNumber === 12)!;
    Object.assign(seg, { language: 'en', speaker: 'narrator', text: 'Good night.' });
    expect(codes(t)).toContain('step12-english');
  });

  it('requires anticipation pauses of at least two seconds', () => {
    const s = good();
    for (const x of s.segments) if (x.stepNumber === 4 || x.stepNumber === 8) x.pauseAfterMs = 500;
    expect(codes(s)).toContain('anticipation-pause');
  });

  it('checks review coverage', () => {
    const later = buildLessonContext('ja-beginner-19');
    const fakeCtx = { ...ctx, reviewVocabulary: later.lesson.vocabularyTargets.slice(0, 4) }; // words this script never uses
    const r = validateScript(good(), fakeCtx, settings);
    expect(r.errors.map((e) => e.code)).toContain('review-coverage');
  });

  it('checks vocabulary coverage', () => {
    const s = good();
    for (const x of s.segments) if (x.language === 'ja-JP') x.text = 'はい。';
    expect(codes(s)).toContain('vocab-coverage');
  });

  it('flags durations far from the target', () => {
    const s = good();
    for (const x of s.segments) x.pauseAfterMs = 0;
    expect(codes(s)).toContain('duration');
  });

  it('matches verb stems and multi-form vocabulary', () => {
    expect(vocabForms('食べます', 'たべます')).toContain('食べ');
    expect(vocabForms('はい / いいえ', 'はい / いいえ')).toEqual(expect.arrayContaining(['はい', 'いいえ']));
    expect(vocabForms('〜人', '〜じん')).toEqual(expect.arrayContaining(['人', 'じん']));
  });

  it('estimates slower speech as longer', () => {
    const base = { language: 'ja-JP' as const, text: '毎日六時に起きます。' };
    expect(estimateSpeechSeconds({ ...base, speechRate: 'slow' })).toBeGreaterThan(estimateSpeechSeconds({ ...base, speechRate: 'natural' }));
  });
});
