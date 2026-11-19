/** Pure helpers shared by server and browser. */
export const normJa = (s: string) => s.replace(/[\s、。！？!?「」『』…・〜ー—\-.,]/g, '');

export function cardKey(c: { kind: 'vocab' | 'phrase'; japanese: string; vocabId?: string }) {
  return c.kind === 'vocab' && c.vocabId ? `vocab:${c.vocabId}` : `phrase:${normJa(c.japanese)}`;
}
