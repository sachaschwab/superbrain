import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handle, readJson } from '@/lib/http';
import { HttpError } from '@/lib/generations';
import { listCards } from '@/lib/flashcards';
import { buildDrill } from '@/lib/drill';

export const dynamic = 'force-dynamic';

const Body = z.object({
  kinds: z.array(z.enum(['vocab', 'phrase'])).min(1),
  piles: z.array(z.number().int().min(1).max(4)).min(1),
});

/** Builds a listening drill from the selected cards. Clips are cached, so only new text costs anything. */
export const POST = handle(async (req: Request) => {
  const { kinds, piles } = Body.parse(await readJson(req));
  const cards = listCards().filter((c) => kinds.includes(c.kind) && piles.includes(c.pile));
  if (!cards.length) throw new HttpError(400, 'No cards in this selection');
  return NextResponse.json(await buildDrill(cards), { status: 201 });
});
