export {};
// End-to-end smoke test against a running server in mock mode:
//   LLM_PROVIDER=mock TTS_PROVIDER=mock npm run dev   (in one terminal)
//   npm run smoke                                      (in another)
// Note: settings saved in the UI override the env defaults; set both providers to "mock" there if needed.
const BASE = process.env.BASE_URL || 'http://localhost:4000';

async function json(path: string, init?: RequestInit) {
  const res = await fetch(BASE + path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}
const step = (msg: string) => console.log(`• ${msg}`);

const { lessons } = await json('/api/lessons');
step(`curriculum: ${lessons.length} lessons`);
if (lessons.length !== 20) throw new Error('expected 20 lessons');

const { settings } = await json('/api/settings');
if (settings.llm.provider !== 'mock' || settings.tts.provider !== 'mock') throw new Error('Set both providers to "mock" in Settings before running the smoke test');

const lesson = lessons[0];
const { generationId } = await json(`/api/lessons/${lesson.id}/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ allowDuplicate: true }) });
step(`started generation ${generationId}`);

let gen;
for (let i = 0; i < 300; i++) {
  gen = await json(`/api/generations/${generationId}`);
  if (gen.status === 'ready' || gen.status === 'failed') break;
  await new Promise((r) => setTimeout(r, 1000));
}
if (gen.status !== 'ready') throw new Error(`generation ended as ${gen.status}: ${gen.errorMessage}`);
step(`ready: ${Math.round(gen.durationSeconds)} s of audio`);

const range = await fetch(`${BASE}/api/generations/${generationId}/audio`, { headers: { range: 'bytes=0-1023' } });
if (range.status !== 206 || range.headers.get('content-type') !== 'audio/mpeg') throw new Error('audio range request failed');
const dl = await fetch(`${BASE}/api/generations/${generationId}/audio?download=1`);
const bytes = (await dl.arrayBuffer()).byteLength;
step(`audio streams (206) and downloads (${(bytes / 1e6).toFixed(1)} MB)`);

const transcript = await json(`/api/generations/${generationId}/transcript`);
if (transcript.steps.length !== 12) throw new Error('transcript should have 12 steps');
step('transcript has 12 steps');

const detail = await json(`/api/lessons/${lesson.id}`);
if (!detail.generations.some((g: { id: string }) => g.id === generationId)) throw new Error('generation not persisted');
step('generation persisted and listed on the lesson');
console.log('✓ smoke test passed');
