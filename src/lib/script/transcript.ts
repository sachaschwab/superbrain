import { STEPS } from '../config';
import type { CurriculumLesson } from '../curriculum/types';
import type { LessonScript } from './schema';

export type Transcript = ReturnType<typeof buildTranscript>;

export function buildTranscript(script: LessonScript, lesson: CurriculumLesson) {
  const name = (sp: string) => (sp === 'female' ? script.characters.female.name : sp === 'male' ? script.characters.male.name : 'Narrator');
  return {
    lessonId: lesson.id,
    lessonNumber: lesson.number,
    title: script.title,
    situation: script.situation,
    characters: script.characters,
    steps: STEPS.map((step) => ({
      number: step.number,
      name: step.name,
      lines: script.segments
        .filter((s) => s.stepNumber === step.number)
        .map((s) => ({
          id: s.id,
          speaker: s.speaker,
          speakerName: name(s.speaker),
          language: s.language,
          text: s.text,
          reading: s.transcript.reading,
          romaji: s.transcript.romaji,
          translation: s.transcript.translation,
          structuralTranslation: s.transcript.structuralTranslation,
          grammarNote: s.transcript.grammarNote,
        })),
    })),
  };
}

export function transcriptToMarkdown(t: Transcript): string {
  const out = [`# Lesson ${String(t.lessonNumber).padStart(2, '0')} — ${t.title}`, '', `_${t.situation}_`, ''];
  out.push(`Characters: ${t.characters.female.name} (${t.characters.female.role}), ${t.characters.male.name} (${t.characters.male.role})`, '');
  for (const step of t.steps) {
    out.push(`## ${step.number}. ${step.name}`, '');
    for (const l of step.lines) {
      if (l.language === 'en') {
        out.push(`**${l.speakerName}:** ${l.text}`, '');
        continue;
      }
      out.push(`**${l.speakerName}:** ${l.text}`);
      if (l.reading && l.reading !== l.text) out.push(`  ${l.reading}`);
      if (l.romaji) out.push(`  _${l.romaji}_`);
      if (l.translation) out.push(`  → ${l.translation}`);
      if (l.structuralTranslation) out.push(`  ⟶ structure: ${l.structuralTranslation}`);
      if (l.grammarNote) out.push(`  ✎ ${l.grammarNote}`);
      out.push('');
    }
  }
  return out.join('\n');
}
