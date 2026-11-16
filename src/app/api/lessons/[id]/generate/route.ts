import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handle, readJson } from '@/lib/http';
import { startGeneration } from '@/lib/generations';

const Body = z.object({
  mode: z.enum(['full', 'audio_only']).default('full'),
  sourceGenerationId: z.string().uuid().optional(),
  confirmCost: z.boolean().default(false),
  allowDuplicate: z.boolean().default(false),
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = Body.parse(await readJson(req));
  return NextResponse.json(await startGeneration(id, body), { status: 202 });
});
