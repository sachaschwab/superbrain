import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { handle } from '@/lib/http';
import { HttpError } from '@/lib/generations';
import { getDb, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** ?format=md downloads Markdown; default returns the structured JSON transcript. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const gen = getDb().select().from(schema.generations).where(eq(schema.generations.id, id)).get();
  if (!gen?.transcriptPath) throw new HttpError(404, 'Transcript not available yet');
  if (new URL(req.url).searchParams.get('format') === 'md') {
    const md = await readFile(path.join(path.dirname(gen.transcriptPath), 'transcript.md'), 'utf8');
    return new Response(md, {
      headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="${gen.lessonId}-transcript.md"` },
    });
  }
  return NextResponse.json(JSON.parse(await readFile(gen.transcriptPath, 'utf8')));
});
