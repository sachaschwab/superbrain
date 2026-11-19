import { NextResponse } from 'next/server';
import { handle, readJson } from '@/lib/http';
import { addCard, listCards, NewCardSchema } from '@/lib/flashcards';

export const dynamic = 'force-dynamic';

export const GET = handle(() => NextResponse.json({ cards: listCards() }));

export const POST = handle(async (req: Request) => {
  const card = addCard(NewCardSchema.parse(await readJson(req)));
  return NextResponse.json({ card }, { status: 201 });
});
