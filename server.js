// Superbrain — minimal server. No dependencies: Node's http + fetch.
// Keeps API keys server-side; the browser only talks to /api/*.
import http from 'node:http';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const AUDIO_DIR = path.join(ROOT, 'data', 'audio');

const {
  PORT = 3000,
  ANTHROPIC_API_KEY,
  ELEVENLABS_API_KEY,
  ANTHROPIC_MODEL = 'claude-sonnet-5-5',
  ELEVENLABS_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb',
  ELEVENLABS_MODEL = 'eleven_multilingual_v2',
} = process.env;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
};

// ---------- Claude: generate a lesson ----------

const lessonTool = {
  name: 'save_lesson',
  description: 'Save a short language lesson: a list of phrases that will be read aloud by a text-to-speech voice.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short lesson title in English.' },
      phrases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The phrase in the target language, in its standard script (simplified characters for Mandarin). This exact text is sent to TTS.',
            },
            alt_script: {
              type: 'string',
              description: 'Alternative script if relevant (traditional characters for Chinese). Empty string otherwise.',
            },
            romanization: {
              type: 'string',
              description: 'Pinyin with tone marks, Hepburn romaji, etc. Empty string for Latin-script languages.',
            },
            translation: { type: 'string', description: 'Natural English translation.' },
            note: { type: 'string', description: 'One short note on usage, grammar or a key word. May be empty.' },
          },
          required: ['text', 'alt_script', 'romanization', 'translation', 'note'],
        },
      },
    },
    required: ['title', 'phrases'],
  },
};

async function generateLesson({ language, level, topic, count }) {
  if (!ANTHROPIC_API_KEY) throw httpError(500, 'ANTHROPIC_API_KEY is not set in .env');
  const n = Math.min(Math.max(parseInt(count, 10) || 8, 1), 20);

  const prompt = [
    `Create a ${level || 'beginner'} ${language} lesson with exactly ${n} phrases about: ${topic || 'everyday conversation'}.`,
    'Phrases should be natural, things a real person would say, ordered from simpler to harder.',
    'Keep each phrase short enough to repeat after one listen. Use the save_lesson tool.',
  ].join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      tools: [lessonTool],
      tool_choice: { type: 'tool', name: 'save_lesson' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw httpError(res.status, `Anthropic API: ${await res.text()}`);
  const data = await res.json();
  const block = data.content?.find((b) => b.type === 'tool_use');
  if (!block) throw httpError(502, 'Claude did not return a lesson');
  return { language, ...block.input };
}

// ---------- ElevenLabs: text -> mp3 (cached on disk) ----------

async function synthesize({ text, speed = 1 }) {
  if (!ELEVENLABS_API_KEY) throw httpError(500, 'ELEVENLABS_API_KEY is not set in .env');
  if (!text || typeof text !== 'string') throw httpError(400, 'text is required');
  const s = Math.min(Math.max(Number(speed) || 1, 0.7), 1.2);

  const key = createHash('sha256')
    .update([ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL, s, text].join('|'))
    .digest('hex')
    .slice(0, 24);
  const file = path.join(AUDIO_DIR, `${key}.mp3`);
  const url = `/audio/${key}.mp3`;

  try {
    await access(file);
    return { url, cached: true };
  } catch {}

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: s },
      }),
    }
  );
  if (!res.ok) throw httpError(res.status, `ElevenLabs API: ${await res.text()}`);

  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return { url, cached: false };
}

// ---------- HTTP plumbing ----------

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readJson(req, limit = 100_000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw httpError(413, 'Body too large');
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw httpError(400, 'Invalid JSON');
  }
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function serveFile(res, baseDir, relPath) {
  const filePath = path.normalize(path.join(baseDir, relPath));
  if (!filePath.startsWith(baseDir)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && pathname === '/api/lesson') {
      return sendJson(res, 200, await generateLesson(await readJson(req)));
    }
    if (req.method === 'POST' && pathname === '/api/tts') {
      return sendJson(res, 200, await synthesize(await readJson(req)));
    }
    if (req.method === 'GET' && pathname.startsWith('/audio/')) {
      return serveFile(res, AUDIO_DIR, pathname.slice('/audio/'.length));
    }
    if (req.method === 'GET') {
      return serveFile(res, PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    }
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(err.message);
    sendJson(res, err.status || 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Superbrain running at http://localhost:${PORT}`);
  if (!ANTHROPIC_API_KEY) console.warn('  ! ANTHROPIC_API_KEY missing');
  if (!ELEVENLABS_API_KEY) console.warn('  ! ELEVENLABS_API_KEY missing');
});
