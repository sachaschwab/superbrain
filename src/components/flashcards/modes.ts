export const MODES = [
  { id: 'en-ja', label: 'English → Japanese', hint: 'Answer shows Japanese, romaji and audio' },
  { id: 'romaji-en', label: 'Romaji → English', hint: 'Read the romaji, recall the meaning' },
  { id: 'ja-en', label: 'Japanese (writing + audio) → English', hint: 'Read and hear it, recall the meaning' },
  { id: 'audio-en', label: 'Japanese audio only → English', hint: 'Listening only' },
] as const;
export type ModeId = (typeof MODES)[number]['id'];

export const KINDS = [
  { id: 'vocab', label: 'Vocabulary' },
  { id: 'phrase', label: 'Grammar / Phrases' },
] as const;
export type KindId = (typeof KINDS)[number]['id'];

export const PILES = [
  { id: 1, label: 'Pile 1' },
  { id: 2, label: 'Pile 2' },
  { id: 3, label: 'Pile 3' },
  { id: 4, label: 'Learned' },
] as const;
