import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { handle, readJson } from '@/lib/http';
import { getSettings } from '@/lib/settings';
import { createTtsProvider, buildTtsRequest, synthesizeCached } from '@/lib/tts';
import type { AudioSegment } from '@/lib/script/schema';

const SAMPLES = {
  'ja-JP': 'はじめまして。私は田中です。どうぞよろしくお願いします。',
  en: 'Now the vocabulary. You will hear the Japanese first, then the meaning.',
};

const Body = z.object({
  voiceId: z.string().min(1).max(100),
  language: z.enum(['ja-JP', 'en']),
  model: z.string().min(1).max(100).optional(),
  provider: z.enum(['elevenlabs', 'mock']).optional(),
});

/** Short sample in the chosen voice (cached, so repeated previews cost nothing). */
export const POST = handle(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  const base = getSettings();
  const settings = { ...base, tts: { provider: body.provider ?? base.tts.provider, model: body.model ?? base.tts.model } };
  const tts = createTtsProvider(settings);
  const seg: AudioSegment = {
    id: 'preview', stepNumber: 1, speaker: body.language === 'en' ? 'narrator' : 'female', language: body.language,
    text: SAMPLES[body.language], speechRate: 'natural', pauseAfterMs: 0, pronunciationNotes: '',
    transcript: { reading: '', romaji: '', translation: '', structuralTranslation: '', grammarNote: '' },
  };
  const request = { ...buildTtsRequest(seg, settings), voiceId: body.voiceId };
  const { file } = await synthesizeCached(tts, request);
  return new Response(new Uint8Array(await readFile(file)), { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
});
