import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTtsRequests, speechText } from '@/lib/tts';
import { modelCaps } from '@/lib/tts/models';
import { ElevenLabsProvider } from '@/lib/tts/elevenlabs';
import { MockTtsProvider } from '@/lib/tts/mock';
import { buildLessonContext } from '@/lib/curriculum';
import { validateScript } from '@/lib/script/validate';
import { buildMockScript } from '@/lib/llm/mock';
import type { AudioSegment } from '@/lib/script/schema';
import { mockSettings } from './helpers';

const seg = (p: Partial<AudioSegment>): AudioSegment => ({
  id: 's03-01', stepNumber: 3, speaker: 'female', language: 'ja-JP', text: '私。', speechRate: 'slow', pauseAfterMs: 800, pronunciationNotes: '',
  transcript: { reading: 'わたし', romaji: 'watashi', translation: 'I', structuralTranslation: '', grammarNote: '' }, ...p,
});

describe('what is sent to the voice', () => {
  it('sends short isolated Japanese words as their kana reading', () => {
    expect(speechText(seg({}))).toBe('わたし。');
    expect(speechText(seg({ text: '日本人。', transcript: { ...seg({}).transcript, reading: 'にほんじん' } }))).toBe('にほんじん。');
    expect(speechText(seg({ text: 'こんにちは。', transcript: { ...seg({}).transcript, reading: 'こんにちは' } }))).toBe('こんにちは。');
    // sentences (and anything with a possible particle) keep their kanji
    expect(speechText(seg({ text: '私は。', transcript: { ...seg({}).transcript, reading: 'わたしは' } }))).toBe('私は。');
    expect(speechText(seg({ text: '私は学生です。', transcript: { ...seg({}).transcript, reading: 'わたしはがくせいです' } }))).toBe('私は学生です。');
    // a reading that is not pure kana is not trusted
    expect(speechText(seg({ transcript: { ...seg({}).transcript, reading: '私' } }))).toBe('私。');
  });

  it('keeps the kanji when the kana reading would be misread', () => {
    const tr = seg({}).transcript;
    // はは is written laughter (and は can be read "wa"): 母 stays 母
    expect(speechText(seg({ text: '母。', transcript: { ...tr, reading: 'はは。' } }))).toBe('母。');
    expect(speechText(seg({ text: 'ふふ', transcript: { ...tr, reading: 'ふふ' } }))).toBe('ふふ'); // no kanji: unchanged
    // only laughter-like readings: these stay kana, where the bare kanji would be ambiguous or fine
    expect(speechText(seg({ text: '七', transcript: { ...tr, reading: 'なな' } }))).toBe('なな。');
    expect(speechText(seg({ text: '下手', transcript: { ...tr, reading: 'へた' } }))).toBe('へた。');
    expect(speechText(seg({ text: '父', transcript: { ...tr, reading: 'ちち' } }))).toBe('ちち。');
    expect(speechText(seg({ text: '学生。', transcript: { ...tr, reading: 'がくせい。' } }))).toBe('がくせい。');
  });

  it('never speaks the 〜 affix marker and says each alternative reading', () => {
    const tr = seg({}).transcript;
    expect(speechText(seg({ text: '〜分', transcript: { ...tr, reading: '〜ふん / 〜ぷん' } }))).toBe('ふん、ぷん。');
    expect(speechText(seg({ text: '〜時', transcript: { ...tr, reading: '〜じ' } }))).toBe('じ。');
    expect(speechText(seg({ text: 'お〜', transcript: { ...tr, reading: '' } }))).toBe('お');
  });

  it('never sends a slash between English alternatives', () => {
    expect(speechText(seg({ language: 'en', speaker: 'narrator', text: 'yes / no' }))).toBe('yes or no');
  });

  it('gives Japanese segments language context and neighbours', () => {
    const s = mockSettings();
    const reqs = buildTtsRequests(
      [seg({ id: 'a', speaker: 'narrator', language: 'en', text: 'Next word.' }), seg({ id: 'b' }), seg({ id: 'c', text: '名前。', transcript: { ...seg({}).transcript, reading: 'なまえ' } })],
      s
    );
    expect(reqs[0].previousText).toBeUndefined();
    expect(reqs[1].previousText).toBe('日本語の言葉です。'); // no Japanese neighbour before it
    expect(reqs[1].nextText).toBe('なまえ。');
    expect(reqs[2].previousText).toBe('わたし。');
  });

  it('uses slower delivery for slow and medium than natural', () => {
    const s = mockSettings();
    const [slow, medium, natural] = buildTtsRequests([seg({ speechRate: 'slow' }), seg({ speechRate: 'medium', stepNumber: 4 }), seg({ speechRate: 'natural', stepNumber: 5 })], s);
    expect(slow.speed).toBeLessThan(medium.speed);
    expect(medium.speed).toBeLessThan(natural.speed);
    expect(natural.speed).toBeLessThan(1);
  });
});

describe('ElevenLabs model capabilities', () => {
  it('knows which models take language_code, speed and context', () => {
    expect(modelCaps('eleven_multilingual_v2')).toMatchObject({ speed: true, contextText: true, languageCode: false });
    expect(modelCaps('eleven_flash_v2_5')).toMatchObject({ speed: true, languageCode: true });
    expect(modelCaps('eleven_v4')).toMatchObject({ speed: false, contextText: false, languageCode: true, discreteStability: true });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function bodyFor(model: string, speed = 1) {
    const mp3 = await new MockTtsProvider().synthesize({ text: 'こんにちは', voiceId: 'x', language: 'ja-JP', speechRate: 'natural', speed: 1, stability: 0.5 });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(mp3), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await new ElevenLabsProvider(model, 'test-key').synthesize({
      text: 'わたし。', voiceId: 'v1', language: 'ja-JP', speechRate: 'slow', speed, stability: 0.6, previousText: '日本語の言葉です。',
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    return { body, out, mp3 };
  }

  it('multilingual_v2: native speed and context, no language_code', async () => {
    const { body } = await bodyFor('eleven_multilingual_v2', 0.8);
    expect(body.language_code).toBeUndefined();
    expect(body.voice_settings.speed).toBe(0.8);
    expect(body.previous_text).toBe('日本語の言葉です。');
  });

  it('eleven_v4: language_code ja, no speed setting, slowed down afterwards', async () => {
    const { body, out, mp3 } = await bodyFor('eleven_v4', 0.8);
    expect(body.language_code).toBe('ja');
    expect(body.voice_settings.speed).toBeUndefined();
    expect(body.voice_settings.stability).toBe(0.5);
    expect(body.previous_text).toBeUndefined();
    expect(out.equals(mp3)).toBe(false); // time-stretched by FFmpeg
  });
});

describe('pacing checks', () => {
  it('flags merged English glosses and long dialogue turns', () => {
    const settings = mockSettings();
    const ctx = buildLessonContext('ja-beginner-01');
    const s = buildMockScript(ctx, settings);
    s.segments.find((x) => x.stepNumber === 4 && x.language === 'en' && x.pauseAfterMs >= 2000)!.text = 'I, me.';
    const first = s.segments.find((x) => x.stepNumber === 1)!;
    const long = 'こんにちは。はじめまして。私は田中です。お名前は？';
    for (const x of s.segments) if ([1, 9, 10].includes(x.stepNumber) && x.text === first.text) x.text = long;
    const r = validateScript(s, ctx, settings);
    expect(r.errors.map((e) => e.code)).toContain('gloss-list');
    expect(r.warnings.map((w) => w.code)).toContain('long-turn');
  });
});
