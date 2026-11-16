import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from './generations';
import { safeErrorMessage } from './retry';

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message, ...err.body }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ error: 'Invalid input', issues: err.issues }, { status: 400 });
      console.error(err);
      return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
}
