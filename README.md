# Superbrain

Language-learning audio on demand. You pick a language, level and topic;
**Claude** (Anthropic API) writes a short lesson of phrases, and **ElevenLabs**
turns each phrase into an MP3 you can play, slow down, or loop through.

## Run it

Requires Node 20.6+ (uses built-in `fetch` and `--env-file`; no npm dependencies).

```bash
cp .env.example .env     # then add your two API keys
npm start                # → http://localhost:3000
```

`npm run dev` restarts the server when files change.

## How it works

```
browser ──POST /api/lesson──▶ server.js ──▶ Anthropic Messages API (forced tool call → JSON lesson)
browser ──POST /api/tts─────▶ server.js ──▶ ElevenLabs TTS → data/audio/<hash>.mp3
browser ──GET  /audio/…mp3──▶ server.js (static, cached)
```

- API keys stay on the server; the page only calls `/api/*`.
- Lessons come back as structured JSON via a `save_lesson` tool schema:
  `text`, `alt_script` (e.g. traditional characters), `romanization`
  (pinyin / romaji), `translation`, `note`.
- Audio is cached on disk by hash of voice + model + speed + text, so
  replaying a phrase doesn't cost another ElevenLabs call.

## Config (`.env`)

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | required |
| `ELEVENLABS_API_KEY` | — | required |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | |
| `ELEVENLABS_VOICE_ID` | `JBFqnCBsd6RMkjVDRZzb` | any voice from your ElevenLabs library |
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` | |
| `PORT` | `3000` | |

## Layout

```
server.js        HTTP server, Anthropic + ElevenLabs calls
public/          index.html, app.js, style.css
data/audio/      generated MP3s (git-ignored)
```

## Ideas for next steps

- Save lessons (JSON) alongside their audio and list them in the UI
- Voice picker from ElevenLabs `/v1/voices`
- Shadowing mode: phrase → pause → translation → phrase again
- Export a lesson as one stitched MP3 for listening offline
