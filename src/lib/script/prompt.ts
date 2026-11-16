import type { Settings } from '../config';
import { stepTargets } from '../config';
import type { LessonContext } from '../curriculum/types';
import type { Issue } from './validate';
import type { LessonScript, ReviewIssue } from './schema';

/**
 * System instructions for the lesson-script generator (spec §5–7).
 * Kept in one place so the pedagogy can be tuned without touching pipeline code.
 */
export function systemPrompt(settings: Settings): string {
  const targets = stepTargets(settings)
    .map((s) => `  ${String(s.number).padStart(2)}. ${s.name} — about ${s.targetSeconds} s`)
    .join('\n');
  const reg = [settings.includePoliteSpeech && 'polite (です/ます)', settings.includeCasualSpeech && 'casual'].filter(Boolean).join(' and ');

  return `You write scripts for "Japanese at Night", a beginner Japanese audio course that analytically minded adults listen to in bed before sleep.
Guiding principle: understand the structure, recognise the patterns, absorb the language through listening.
The listener never speaks aloud and never touches the device. Never ask for spoken answers.
Explanations are in ${settings.explanationLanguage === 'en' ? 'English' : settings.explanationLanguage}. Target language: standard contemporary Japanese (ja-JP).

OUTPUT
Return one JSON object matching the provided schema: an ordered list of audio segments covering 12 steps, plus metadata.
Every segment is spoken by exactly one voice:
- "female" and "male": the two Japanese dialogue characters (native voices). They speak only Japanese.
- "narrator": the English-speaking guide. The narrator may also say short Japanese example sentences as separate ja-JP segments.
Segment rules:
- "text" is exactly what is spoken — nothing else. No stage directions, no brackets, no "(pause)", no speaker labels, no markdown.
- Japanese segments: kana and kanji as a native would write them. Never romaji in "text". Kanji are fine; the TTS reads them.
- English segments: no Japanese characters at all. When the narrator needs to say a Japanese word inside an English explanation, end the English segment and put the Japanese in its own ja-JP segment, then continue in a new English segment.
- Pauses are produced by "pauseAfterMs", never by words. Typical values: 400–800 between dialogue turns, 1000–1500 after explanations, 2000–3000 for anticipation, 3000–5000 in Step 12.
- speechRate: "slow" for first presentation of new words and chunked sentences; "medium" for clear speech (Step 9); "natural" for real conversation (Steps 1, 10, 11); "gentle" for the calm ending (Step 12) and soft narration.
- Fill "transcript" for every Japanese segment: kana reading, Hepburn romaji with long vowels marked (ō, ū), natural English translation, structural gloss when useful (Step 6 always), and a short grammar note when relevant. For English segments the transcript fields are empty strings.
- Segment ids: "s<step>-<n>", e.g. "s05-07".

PEDAGOGY
- Comprehensible input: language appears first in a meaningful conversation and becomes understandable through the explanations that follow.
- Structural understanding: explain how Japanese builds meaning (word order, particles, verb forms, politeness). Prefer contrastive minimal pairs over theory.
- Distributed repetition: each target word returns in several different steps, not only in immediate repetition.
- Retrieval practice: anticipation prompts invite silent recall only ("think of the Japanese…"), followed by a pause and the answer.
- Contextual variation: reuse the pattern with a changed subject, object, place, time, tense, polarity or politeness — one change at a time.
- Progressive difficulty: build only on grammar from this or earlier lessons. Do not use grammar from later lessons.
- Relaxed listening: the final step contains no English, no explanations, no questions, no new words.
- Never claim that language can be learned while asleep or unconscious.
- Grammar depth: ${settings.grammarDepth}. Review intensity: ${settings.reviewIntensity}.

JAPANESE REQUIREMENTS
1. Standard contemporary Japanese, socially natural for the situation.
2. Registers in this course: ${reg}. Use casual speech only where the relationship (friends, family) justifies it, and never switch register mid-conversation without a reason the listener can hear.
3. Explain particles when they matter.
4. Treat dictionary forms and ます-forms as distinct; do not use verb forms the curriculum has not reached.
5. Do not imply every word has a casual and a polite equivalent.
6. Preserve vowel length (e.g. 東京 とうきょう, not とうきょ); write words so the TTS pronounces them correctly.
7. Do not confuse pitch accent with sentence intonation. Do not teach pitch accent unless it is essential.
8. Introduce conjugation step by step; avoid advanced honorific/humble constructions unless the lesson includes them.
9. Every dialogue must be something real people would say in that situation.

THE 12 STEPS (targets for a ${settings.targetDurationMinutes}-minute lesson including pauses; total may vary ±15%; do not pad a step if it would sound unnatural)
${targets}

Step 1 — First exposure dialogue: ${settings.dialogueTurnsMin}–${settings.dialogueTurnsMax} turns between the female and male characters using the lesson's main vocabulary and grammar. Natural, clearly articulated. No explanation. speechRate "natural".
Step 2 — Context and meaning: narrator explains the situation and the meaning of the dialogue in English. Brief.
Step 3 — Vocabulary recognition: introduce ${settings.newVocabularyMin}–${settings.newVocabularyMax} items from the curriculum targets. Pattern per item: Japanese (slow, a dialogue voice) → pause → English meaning (narrator) → Japanese again. Put important items into a short meaningful context.
Step 4 — Vocabulary anticipation: per item: English (narrator) → pause ≥ 2000 ms → Japanese → Japanese repeated. ${settings.enableMentalRetrieval ? 'Tell the listener once, at the start, to think of the Japanese silently.' : ''}
Step 5 — Structural deep dive: ${settings.enableGrammarAnalysis ? 'explain the primary grammar: word order, particles, verb forms and conjugation, grammatical function, politeness differences, important exceptions. Concise, with contrasting Japanese examples as separate segments.' : 'brief grammar overview.'}
Step 6 — Sentence decomposition: analyse 4–6 sentences. For each: natural English translation → ${settings.enableStructuralTranslation ? 'structural English that follows Japanese word order (say clearly that this is an analytical gloss) → ' : ''}the Japanese in meaningful chunks (one ja-JP segment per chunk, slow, short pauses) → the complete sentence → the complete sentence again naturally. Explain particles or morphology where needed.
Step 7 — Pattern variation: ${settings.enablePatternVariations ? 'take 2–3 key structures and change one component at a time (subject, object, place, time, tense, polarity, politeness). Name what changes in English, then the Japanese.' : 'one short set of variations.'}
Step 8 — Guided anticipation: English meaning or a partial Japanese cue (narrator) → pause 2000–3000 ms → the correct Japanese → repeated naturally. No spoken answers requested.
Step 9 — Conversation replay: the Step 1 dialogue again — exactly the same speakers, the same text, in the same order — speechRate "medium". No explanations.
Step 10 — Natural conversation: the Step 1 dialogue again, exactly the same, speechRate "natural".
Step 11 — Contextual transfer: a new short conversation (4–6 turns) in a different situation using mostly familiar vocabulary and the same grammar. No new grammar.
Step 12 — Relaxed consolidation: ${settings.endWithRelaxedListening ? 'familiar Japanese phrases and short exchanges taken from earlier in this lesson, spoken gently by the dialogue voices with long pauses. No English, no questions, no new words. Every Step 12 line must appear (word for word) earlier in the lesson. Finish gently.' : 'a short calm recap of familiar phrases in Japanese only.'}
`;
}

export function lessonPrompt(ctx: LessonContext, settings: Settings): string {
  const { lesson } = ctx;
  const known = ctx.priorVocabulary.map((v) => `${v.japanese}（${v.reading}）`).join('、');
  const priorGrammar = ctx.priorGrammar.map((g) => `${g.id} ${g.name}`).join('; ');
  return `Write the full script for lesson ${lesson.number}: "${lesson.title}" — ${lesson.topic}.
Description: ${lesson.description}
Registers for this lesson: ${lesson.targetRegisters.join(', ')}.

Communicative objectives:
${lesson.objectives.map((o) => `- ${o}`).join('\n')}

Target vocabulary (respect these; you may add a few supporting words only if essential and already simple):
${lesson.vocabularyTargets.map((v) => `- ${v.id}: ${v.japanese}（${v.reading}, ${v.romaji}）= ${v.english} [${v.partOfSpeech}]`).join('\n')}

Grammar targets:
${lesson.grammarTargets.map((g) => `- ${g.id} (${g.role}): ${g.name}\n  ${g.explanation}\n  Examples: ${g.examples.join(' / ')}`).join('\n')}

${settings.includePreviousLessonReview && ctx.reviewVocabulary.length ? `Review material to weave in naturally (reuse these in dialogue, variations and anticipation):
${ctx.reviewVocabulary.map((v) => `- ${v.id}: ${v.japanese}（${v.reading}）= ${v.english}`).join('\n')}
${ctx.reviewGrammar.map((g) => `- ${g.id}: ${g.name}`).join('\n')}
` : ''}
Teaching notes from the curriculum author:
${lesson.teachingNotes || '(none)'}

Previously learned vocabulary (the listener knows these): ${known || '(none — this is the first lesson)'}
Previously learned grammar: ${priorGrammar || '(none)'}

List the curriculum ids you actually used in coveredVocabularyIds, coveredGrammarIds and reviewedVocabularyIds.`;
}

export function correctionPrompt(script: unknown, errors: Issue[], reviewIssues: ReviewIssue[] = []): string {
  const lines = [
    ...errors.map((e) => `- [${e.code}]${e.segmentId ? ` ${e.segmentId}:` : ''} ${e.message}`),
    ...reviewIssues.map((i) => `- [${i.category}] ${i.segmentId}: ${i.problem} → ${i.suggestedFix}`),
  ];
  return `The script below failed validation. Fix exactly these problems and keep everything else as it is (same steps, same dialogue unless the dialogue itself is the problem — if you change Step 1, change Steps 9 and 10 identically).

Problems:
${lines.join('\n')}

Return the complete corrected script as JSON.

Current script:
${JSON.stringify(script)}`;
}

export function reviewSystemPrompt(): string {
  return `You are a native-level Japanese teacher reviewing a beginner audio-lesson script before it is sent to speech synthesis.
Check only things that need linguistic judgement:
- Japanese grammar errors, unnatural phrasing, wrong particles, wrong conjugations
- Wrong or misleading English translations and structural glosses
- Wrong kana readings or romaji (e.g. missing long vowels)
- Inappropriate or unjustified register switching between casual and polite
- Explanations that are factually wrong about Japanese
- Socially unnatural dialogue
Mark an issue "error" only if a learner would be taught something wrong or the audio would sound wrong. Style preferences are "warning".
Set approved=true if there are no errors.`;
}

export function reviewPrompt(script: LessonScript, ctx: LessonContext): string {
  return `Lesson ${ctx.lesson.number}: ${ctx.lesson.title}. Target registers: ${ctx.lesson.targetRegisters.join(', ')}.
Primary grammar: ${ctx.lesson.grammarTargets.filter((g) => g.role === 'primary').map((g) => g.name).join('; ')}.

Script segments (id | step | speaker | language | text | reading | translation | structural):
${script.segments
  .map((s) => [s.id, s.stepNumber, s.speaker, s.language, s.text, s.transcript.reading, s.transcript.translation, s.transcript.structuralTranslation].join(' | '))
  .join('\n')}`;
}
