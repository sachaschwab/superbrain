import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handle, readJson } from '@/lib/http';
import { getCard, removeCard, setPile } from '@/lib/flashcards';
import { HttpError } from '@/lib/generations';

const Patch = z.object({ pile: z.number().int().min(1).max(4), reviewed: z.boolean().default(false) });

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { pile, reviewed } = Patch.parse(await readJson(req));
  const card = setPile(id, pile, reviewed);
  if (!card) throw new HttpError(404, 'Card not found');
  return NextResponse.json({ card });
});

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!getCard(id)) throw new HttpError(404, 'Card not found');
  removeCard(id);
  return new Response(null, { status: 204 });
});
