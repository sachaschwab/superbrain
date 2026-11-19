# Superbrain — Japanese at Night

AI-generated bedtime Japanese audio lessons. A 20-lesson beginner curriculum; for each
lesson Claude writes a structured, validated 12-step script, ElevenLabs voices it with three
voices (female, male, narrator), and FFmpeg assembles one ~18-minute MP3 with programmatic pauses.

> Understand the structure. Recognise the patterns. Absorb the language through listening.

Scope of this version (Phase 1 MVP): one language (Japanese), one audio mode (12-step
analytical-passive lesson), single user, local machine.

## Quick start

Requires **Node.js 20.9+** (22 LTS recommended). FFmpeg is bundled via `ffmpeg-static`.

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY and ELEVENLABS_API_KEY
npm run dev                 # → http://localhost:4000 (falls back to 4001 if busy)
```

The SQLite database (`data/superbrain.db`) is created and migrated automatically on first
start, and the curriculum is synced from `data/curriculum/japanese-beginner.json`.

### Try it without paid API calls

Set `LLM_PROVIDER=mock` and `TTS_PROVIDER=mock` in `.env` (or choose **mock** under Settings).
The mock script is structurally valid but pedagogically thin, and the mock voice is a soft tone —
it exists to demonstrate and test the pipeline end to end.

> Env values are only first-run defaults. Once you press **Save settings**, the saved values win.

### Before producing real audio

1. **Pick voices.** The default voice IDs are stock English ElevenLabs voices. For natural Japanese,
   choose native Japanese voices in the ElevenLabs Voice Library and paste their IDs into
   Settings → Voices (female, male; narrator stays English).
   Use **▶ Test** next to each voice to hear a short Japanese sample before generating.
   - **Model:** `eleven_v4` gives the most native Japanese accent, even for non-Japanese voices,
     but has no speed setting, so the app slows segments afterwards with FFmpeg (pitch preserved).
     `eleven_multilingual_v2` keeps native speed control but can carry the voice's own accent;
     with it, the app sends neighbouring Japanese text as context. `eleven_flash_v2_5` is cheaper
     and also accepts the `language_code` setting that forces Japanese pronunciation.
   - Single Japanese words in vocabulary drills are sent to the voice as their kana reading (私 → わたし),
     so the model doesn't guess the reading or slip into an English accent; the transcript keeps the kanji.
2. **Enter prices** (Settings → Cost controls) if you want cost estimates and a confirmation
   threshold. No prices are assumed.
3. Generate **Lesson 1**, read the script ("Inspect script" / transcript), and listen to it in bed
   before producing the rest.

## Flashcards

- **Adding cards:** the card icon next to each vocabulary word, grammar example and transcript line
  adds it to your flashcards. A filled icon means the item is already a card; click again to remove it.
  The same word or phrase toggles the same card wherever it appears.
- **Studying:** pick a direction on the main page — English → Japanese, Romaji → English, Japanese
  (writing + audio) → English, or audio only → English — and whether to cover vocabulary, phrases or both.
- **Piles:** classic three-pile system. “Knew it” moves a card up a pile, and after Pile 3 it counts as
  learned; “Not yet” moves it back one. Under “All cards” you can move any card by hand or remove it.
  Keys: space flips, → knew it, ← not yet.
- **Audio:** transcript phrases replay their exact lesson recording at no cost. Words and example
  sentences are voiced once with your current voices and cached.

## How it works

```
Lesson (curriculum JSON) ─▶ A. build context (targets + earlier vocab/grammar + review items)
                         ─▶ B. Claude writes the script (structured JSON output, streamed)
                         ─▶ C. validate: schema + rules  ──fail──▶ targeted correction (≤2 rounds)
                               + LLM linguistic review    ──fail──▶ targeted correction
                         ─▶ D. ElevenLabs per segment (cached, retried, 3 in parallel)
                         ─▶ E. FFmpeg: per-clip loudness, generated silences, concat, limiter, MP3
                         ─▶ F. save MP3, transcript (JSON + Markdown), script, config snapshot, usage
```

- **Two-stage design:** the script is stored separately from the audio. *Regenerate audio only*
  reuses the script with new voices/speed (and the TTS cache makes unchanged segments free);
  *Regenerate script + audio* writes a new script. Old generations are never deleted.
- **Background jobs:** `POST /api/lessons/:id/generate` returns immediately; a persistent
  single-worker queue in SQLite runs the job. The UI polls for progress. Jobs left running when
  the server stopped are resumed on the next start.
- **Failure handling:** API calls retry on 429/5xx/network errors with backoff. If a TTS segment
  fails, the job fails without discarding work — **Retry** resumes from the cached segments and
  the saved script. A script that stays invalid is kept for inspection and is never synthesised.
- **Duplicate protection:** a second generation for a lesson is refused while one is running.

### Validation rules (Phase C)

Deterministic checks in `src/lib/script/validate.ts`:
all 12 steps present and in order · dialogue steps use only the female/male voices in Japanese ·
English segments contain no Japanese script (the narrator's Japanese goes in separate segments) ·
Japanese segments contain kana/kanji (romaji is never synthesised) · no stage directions or markup
in spoken text · Steps 9 and 10 replay Step 1 exactly · anticipation steps have ≥2 s pauses ·
Step 12 is Japanese only and contains only lines heard earlier · target vocabulary coverage and
distributed repetition · review-word reuse · estimated duration within range of the target.

Linguistic judgement (grammar, translations, readings, register switching, naturalness) is a second
Claude pass with its own structured output; its errors trigger a targeted correction.

## Project layout

```
data/curriculum/japanese-beginner.json   20 lessons — editable seed data (run npm run validate:curriculum)
drizzle/                                  SQL migrations (applied automatically)
src/lib/config.ts                         LessonConfig defaults + the 12-step schema
src/lib/script/prompt.ts                  pedagogical system instructions for the LLM
src/lib/script/{schema,validate,generate,transcript,duration}.ts
src/lib/llm/{anthropic,mock}.ts           LLM providers
src/lib/tts/{elevenlabs,mock,index}.ts    TTS providers, voice/rate mapping, cache
src/lib/audio/{assemble,ffmpeg}.ts        FFmpeg assembly
src/lib/pipeline.ts                       phases A–F
src/lib/jobs/worker.ts                    persistent job queue
src/app/                                  pages + API routes
tests/                                    Vitest unit + integration tests
scripts/smoke.ts                          API end-to-end smoke test
```

### API

| Method | Path | |
|---|---|---|
| GET | `/api/lessons` | curriculum with latest status per lesson |
| GET | `/api/lessons/:id` | lesson, review material, steps, generations |
| GET | `/api/lessons/:id/estimate?mode=full\|audio_only` | cost estimate |
| POST | `/api/lessons/:id/generate` | `{ mode?, sourceGenerationId?, confirmCost?, allowDuplicate? }` → 202 `{ generationId }`; 409 if running; 402 if over the cost limit |
| GET | `/api/generations/:id` | status, progress, usage, validation notes |
| POST | `/api/generations/:id/retry` | resume a failed generation |
| GET | `/api/generations/:id/script` | the structured script |
| GET | `/api/generations/:id/transcript` | JSON; `?format=md` downloads Markdown |
| GET | `/api/generations/:id/audio` | MP3 with Range support; `?download=1` |
| GET/PUT | `/api/settings` | validated server-side; API keys are never exposed |

## Tests

```bash
npm test                    # 40 unit + integration tests (mock LLM/TTS, real FFmpeg)
npm run validate:curriculum
# end-to-end against a running server in mock mode:
LLM_PROVIDER=mock TTS_PROVIDER=mock npm run dev
npm run smoke
```

## Curriculum notes

The 20 lessons follow the specification's topics, with a linguistic review applied:
dates of the month (irregular) are deferred from Lesson 4; Lesson 9 limits counters to 〜つ and
〜人; the て-form (Lesson 15) is built from the ます-stem in three passes and re-scaffolded in
Lessons 16 and 19; the dictionary form is introduced formally in Lesson 17 and the ない-form in
Lesson 18, so casual verb forms are not used before then; Lesson 16 stays polite because casual
invitations need forms not yet taught. Each lesson carries `teachingNotes` that go to the
generator. This is an introductory audio course, not a complete A1 syllabus.

## Known limitations

- **Single process.** The job queue lives in one Node process and SQLite. It does not coordinate
  across several server instances and won't work on serverless hosting (e.g. Vercel functions),
  where the process stops between requests. For deployment, run it on one long-lived server, or
  move jobs to a real queue (e.g. BullMQ/Redis) and files to object storage.
- **Duration** is estimated from text length before synthesis; the real length is measured after
  assembly.
- **ElevenLabs usage** is recorded as characters sent (cache hits count zero); your bill is the
  authority.
- **Database:** the spec suggested Prisma; this uses Drizzle ORM on the same SQLite schema
  (Lesson, Generation, GenerationJob, VocabularyItem, GrammarPattern, GenerationUsage, Settings).
- **iCloud Drive:** this folder syncs `node_modules/`, `.next/` and `data/` (the TTS cache can
  grow large). To keep them local, run `mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules`
  (same for `data`), or set `DATA_DIR` to a folder outside iCloud.
