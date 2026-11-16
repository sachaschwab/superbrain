import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import { getGenerationView, HttpError } from '@/lib/generations';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const view = getGenerationView(id);
  if (!view) throw new HttpError(404, 'Generation not found');
  return NextResponse.json(view);
});
