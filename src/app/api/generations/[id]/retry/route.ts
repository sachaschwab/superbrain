import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import { retryGeneration } from '@/lib/generations';

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return NextResponse.json(retryGeneration(id), { status: 202 });
});
