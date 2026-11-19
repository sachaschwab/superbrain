import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from './db';
import { cardKey } from './card-key';

export { cardKey };

export type Flashcard = typeof schema.flashcards.$inferSelect;
export const PILE_NAMES: Record<number, string> = { 1: 'Pile 1', 2: 'Pile 2', 3: 'Pile 3', 4: 'Learned' };

export const NewCardSchema = z.object({
  kind: z.enum(['vocab', 'phrase']),
  japanese: z.string().min(1).max(300),
  reading: z.string().max(300).default(''),
  romaji: z.string().max(300).default(''),
  english: z.string().min(1).max(300),
  lessonId: z.string().max(100).optional(),
  vocabId: z.string().max(20).optional(),
  generationId: z.string().max(100).optional(),
  segmentId: z.string().max(40).optional(),
});
export type NewCard = z.infer<typeof NewCardSchema>;

export function listCards(): Flashcard[] {
  return getDb().select().from(schema.flashcards).orderBy(asc(schema.flashcards.createdAt)).all();
}

export function addCard(input: NewCard): Flashcard {
  const db = getDb();
  const key = cardKey(input);
  const existing = db.select().from(schema.flashcards).where(eq(schema.flashcards.key, key)).get();
  if (existing) return existing;
  const row = { id: randomUUID(), key, pile: 1, ...input };
  db.insert(schema.flashcards).values(row).run();
  return db.select().from(schema.flashcards).where(eq(schema.flashcards.id, row.id)).get()!;
}

export function getCard(id: string) {
  return getDb().select().from(schema.flashcards).where(eq(schema.flashcards.id, id)).get();
}

export function removeCard(id: string) {
  getDb().delete(schema.flashcards).where(eq(schema.flashcards.id, id)).run();
}

export function setPile(id: string, pile: number, reviewed = false) {
  const card = getCard(id);
  if (!card) return undefined;
  const p = Math.min(4, Math.max(1, Math.round(pile)));
  getDb()
    .update(schema.flashcards)
    .set({ pile: p, ...(reviewed ? { reviewCount: card.reviewCount + 1, reviewedAt: new Date() } : {}) })
    .where(eq(schema.flashcards.id, id))
    .run();
  return getCard(id);
}
