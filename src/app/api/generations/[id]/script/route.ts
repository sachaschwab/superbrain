import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import { getScript, HttpError } from '@/lib/generations';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const script = getScript(id);
  if (!script) throw new HttpError(404, 'No script for this generation yet');
  return NextResponse.json(script);
});
