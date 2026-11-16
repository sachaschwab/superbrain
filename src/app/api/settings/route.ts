import { NextResponse } from 'next/server';
import { handle, readJson } from '@/lib/http';
import { getSettings, updateSettings } from '@/lib/settings';
import { HttpError } from '@/lib/generations';

export const dynamic = 'force-dynamic';

export const GET = handle(() =>
  NextResponse.json({
    settings: getSettings(),
    // Only whether keys exist — never the keys themselves.
    keys: { anthropic: !!process.env.ANTHROPIC_API_KEY, elevenlabs: !!process.env.ELEVENLABS_API_KEY },
  })
);

export const PUT = handle(async (req: Request) => {
  try {
    return NextResponse.json({ settings: updateSettings(await readJson(req)) });
  } catch (err) {
    if (err instanceof Error && !('issues' in err) && !(err instanceof HttpError)) throw new HttpError(400, err.message);
    throw err;
  }
});
